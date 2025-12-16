// UpgradeNFT.tsx
import { useState, useEffect, useMemo } from "react";
import { useAccount, useReadContracts, useWriteContract } from "wagmi";
import { toast } from "react-toastify";
import type { Abi } from "viem";
import { Zap, CornerUpRight, Diamond } from "lucide-react";

import { abi as oldNftAbi } from "../hooks/abi/abiNFT";
import { monchilIdAbi } from "../hooks/abi/AbiMonchilID";
import { upgradeAbi } from "../hooks/abi/AbiUpgrade";

const OLD_NFT_CONTRACT: `0x${string}` = "0xc84932efcBeEdbcf5B25F41461DE3F2b7DB8f5Eb";
const NEW_NFT_CONTRACT: `0x${string}` = "0xd9145CCE52D386f254917e481eB44e9943F39138";
const UPGRADE_CONTRACT: `0x${string}` = "0x15209966E8455eE1752c9139c3340CbE0CA93600";

const MAX_REALIZED_LEVEL = 2;

const NFT_CONFIG = {
    old1: { level: 0, id: 1, name: "Happy Mon (ID 1)", image: "/happy.png" },
    old2: { level: 0, id: 2, name: "Sad Mon (ID 2)", image: "/sad.png" },
    new1: { level: 1, id: 1, name: "Monchil Lv. 1", image: "/1.png" },
    new2: { level: 2, id: 2, name: "Monchil Lv. 2", image: "/2.png" },
};

type ContractConfig = {
    abi: Abi;
    address: `0x${string}`;
    functionName: string;
    args?: readonly unknown[];
};

export function UpgradeNFT() {
    const { address, isConnected } = useAccount();
    const { writeContractAsync, isPending: isTxPending } = useWriteContract();

    const [selectedCardId, setSelectedCardId] = useState<'old1' | 'old2' | 'new1' | 'new2' | null>(null);
    const [isApproving, setIsApproving] = useState(false);

    const userAddress = address || "0x0000000000000000000000000000000000000000";

    const contracts: ContractConfig[] = useMemo(() => [
        { abi: oldNftAbi, address: OLD_NFT_CONTRACT, functionName: "balanceOf", args: [userAddress, 1n] },
        { abi: oldNftAbi, address: OLD_NFT_CONTRACT, functionName: "balanceOf", args: [userAddress, 2n] },
        { abi: monchilIdAbi, address: NEW_NFT_CONTRACT, functionName: "balanceOf", args: [userAddress, 1n] },
        { abi: monchilIdAbi, address: NEW_NFT_CONTRACT, functionName: "balanceOf", args: [userAddress, 2n] },
        
        { abi: upgradeAbi, address: UPGRADE_CONTRACT, functionName: "upgradeFees", args: [1n] },
        { abi: upgradeAbi, address: UPGRADE_CONTRACT, functionName: "upgradeFees", args: [2n] },
        { abi: upgradeAbi, address: UPGRADE_CONTRACT, functionName: "upgradeFees", args: [3n] },

        { abi: oldNftAbi, address: OLD_NFT_CONTRACT, functionName: "isApprovedForAll", args: [userAddress, UPGRADE_CONTRACT] },
        { abi: monchilIdAbi, address: NEW_NFT_CONTRACT, functionName: "isApprovedForAll", args: [userAddress, UPGRADE_CONTRACT] },
    ], [userAddress]);

    const { data: contractData, refetch } = useReadContracts({
        contracts: contracts as any,
        query: { enabled: isConnected, staleTime: 5000 },
    });

    const dataArray = contractData?.map(d => (d.status === "success" ? (d.result || 0n) : 0n)) ?? [];

    const balances = {
        old1: dataArray[0] as bigint,
        old2: dataArray[1] as bigint,
        new1: dataArray[2] as bigint,
        new2: dataArray[3] as bigint,
    };

    const fees = {
        1: dataArray[4] as bigint, 
        2: dataArray[5] as bigint, 
        3: dataArray[6] as bigint,
    };

    const isOldApproved = dataArray[7] as boolean | undefined;
    const isNewApproved = dataArray[8] as boolean | undefined;

    const currentLevelId = selectedCardId === 'old1' || selectedCardId === 'old2' ? 0 : selectedCardId === 'new1' ? 1 : 2;
    const nextLevel = currentLevelId + 1;
    const isLevel1Upgrade = currentLevelId === 0;

    const requiredFee = fees[nextLevel as keyof typeof fees] || 0n;
    
    let approvalNeeded = false;

    if (isConnected && selectedCardId !== null) {
        if (isLevel1Upgrade && isOldApproved === false) {
            approvalNeeded = true;
        } else if (!isLevel1Upgrade && isNewApproved === false) {
            approvalNeeded = true;
        }
    }

    const readyToUpgrade = useMemo(() => {
        if (selectedCardId === 'old1' || selectedCardId === 'old2') {
            return (balances.old1 ?? 0n) >= 1n && (balances.old2 ?? 0n) >= 1n;
        } else if (selectedCardId === 'new1') {
            return (balances.new1 ?? 0n) >= 2n;
        }
        return false;
    }, [selectedCardId, balances]);

    const disableUpgradeButton = !isConnected || isTxPending || isApproving || approvalNeeded || !readyToUpgrade || selectedCardId === null || nextLevel > MAX_REALIZED_LEVEL;


    useEffect(() => {
        if (isConnected) {
            const interval = setInterval(() => refetch(), 15000);
            return () => clearInterval(interval);
        }
    }, [isConnected, refetch]);

    const handleApprove = async (isOld: boolean) => {
        if (!address) return toast.error("Wallet not connected");
        
        const contract = isOld ? OLD_NFT_CONTRACT : NEW_NFT_CONTRACT;
        const abi = isOld ? oldNftAbi : monchilIdAbi;

        setIsApproving(true);
        try {
            await writeContractAsync({
                address: contract,
                abi: abi as Abi,
                functionName: "setApprovalForAll",
                args: [UPGRADE_CONTRACT, true],
            });
            toast.success(`Approval for ${isOld ? 'Old NFT' : 'New NFT'} sent.`);
        } catch (err) {
            console.error(err);
            toast.error("Approval Failed.");
        } finally {
            setIsApproving(false);
        }
    };

    const handleUpgrade = async () => {
        if (disableUpgradeButton) return;

        try {
            if (isLevel1Upgrade) {
                await writeContractAsync({
                    address: UPGRADE_CONTRACT,
                    abi: upgradeAbi as Abi,
                    functionName: "upgradeToLevel1",
                    value: requiredFee,
                });
            } else {
                const currentLevel = BigInt(currentLevelId);
                await writeContractAsync({
                    address: UPGRADE_CONTRACT,
                    abi: upgradeAbi as Abi,
                    functionName: "upgradeLevel",
                    args: [currentLevel],
                    value: requiredFee,
                });
            }

            toast.success(`Upgrade to Level ${nextLevel} initiated.`);
            refetch();

        } catch (err) {
            console.error(err);
            toast.error("Upgrade Failed.");
        }
    };

    const renderNftCard = (
        cardKey: 'old1' | 'old2' | 'new1' | 'new2', 
        name: string, 
        imageSrc: string, 
        balance: bigint | undefined, 
        levelLabel: string,
        isUpgradeable: boolean
    ) => {
        const isSelected = selectedCardId === cardKey;
        const safeBalance = balance ?? 0n; 
        
        const displayBalanceString = safeBalance.toString();
        const displayCount = displayBalanceString === '0' ? 0 : Number(displayBalanceString);
        
        const isClickable = isConnected && (cardKey === 'new1' || cardKey === 'new2');
        
        const isOldComplete = (balances.old1 ?? 0n) >= 1n && (balances.old2 ?? 0n) >= 1n;
        const showReadyBadge = (cardKey.startsWith('old') && isOldComplete) || 
                               (cardKey === 'new1' && isUpgradeable);


        return (
            <div
                key={cardKey}
                onClick={() => isClickable ? setSelectedCardId(cardKey) : null}
                className={`relative bg-gray-800 rounded-xl p-3 transition transform duration-300 shadow-lg 
                    ${isClickable ? 'cursor-pointer hover:scale-[1.03]' : 'cursor-default'}
                    ${isSelected ? 'border-4 border-pink-500 ring-2 ring-pink-500' : 'border border-gray-700'}
                    ${showReadyBadge && !isSelected ? 'border-yellow-400' : ''}
                `}
            >
                {displayCount > 0 && (
                    <span className="absolute top-0 right-0 bg-purple-600 text-white text-xs font-bold px-2 py-1 rounded-bl-lg rounded-tr-xl z-10">
                        x{displayCount}
                    </span>
                )}
                
                {showReadyBadge && !isSelected && (
                    <span className="absolute top-0 left-0 bg-green-500 text-white text-xs font-bold px-2 py-1 rounded-br-lg rounded-tl-xl z-10 flex items-center gap-1">
                        <Zap className="w-3 h-3"/> READY
                    </span>
                )}
                
                <img 
                    src={imageSrc} 
                    alt={name} 
                    className={`w-full h-auto rounded-lg mb-2 object-cover ${!isConnected ? 'grayscale' : ''}`} 
                />
                <p className="text-sm font-semibold text-white truncate">{name}</p>
                <p className="text-xs text-gray-400">OWN: {displayCount}</p>
                <p className="text-xs text-gray-400">{levelLabel}</p>
            </div>
        );
    };
    
    const renderActionPanel = () => {
        if (selectedCardId === null) {
            return <p className="text-gray-400">Click an NFT card to begin the upgrade process.</p>;
        }

        if (selectedCardId === 'old1' || selectedCardId === 'old2') {
            const targetLevel = 1;
            
            const levelLabel = "Old NFT (ID 1 & 2)";
            const feeDisplay = fees[1 as keyof typeof fees] > 0n ? `${Number(fees[1 as keyof typeof fees]) / 1e18} ETH` : 'N/A';
            const requirementMessage = `1x Happy Mon & 1x Sad Mon (Transferred).`;
            const approvalStatus = isOldApproved ? '✅ Approved' : '❌ Needed';
            const contractToApprove = 'Old NFT';

            return (
                <div className="bg-gray-700 p-4 rounded-xl text-left">
                    <h3 className="text-xl font-bold text-pink-400 mb-3 flex items-center gap-2">
                        <Zap className="w-5 h-5"/> UPGRADE: {levelLabel} <CornerUpRight className="w-4 h-4 text-purple-400"/> Lv. {targetLevel}
                    </h3>
                    
                    <p className="text-gray-300 mb-1">
                        <span className="font-bold">Needed:</span> {requirementMessage}
                    </p>
                    <p className="text-gray-300 mb-3">
                        <span className="font-bold">Fee:</span> {feeDisplay}
                    </p>

                    <div className="mb-4 text-sm">
                        <p className="text-gray-400">Approval Status for {contractToApprove}: {approvalStatus}</p>
                    </div>

                    {renderActionButton(true)}
                </div>
            );

        } else if (selectedCardId === 'new2') {
             return <p className="text-gray-400 font-bold">Monchil Lv. 2 adalah level tertinggi yang dirilis saat ini.</p>;
        }
        
        const currentLevel = currentLevelId; 
        const targetLevel = currentLevel + 1;
        
        const levelLabel = `Monchil Lv. ${currentLevel}`;
        const feeDisplay = requiredFee > 0n ? `${Number(requiredFee) / 1e18} ETH` : 'N/A';
        const requirementMessage = `2x Monchil Lv. ${currentLevel} (Burned).`;
        const approvalStatus = isNewApproved ? '✅ Approved' : '❌ Needed';
        const contractToApprove = 'New NFT';


        return (
            <div className="bg-gray-700 p-4 rounded-xl text-left">
                <h3 className="text-xl font-bold text-pink-400 mb-3 flex items-center gap-2">
                    <Zap className="w-5 h-5"/> UPGRADE: {levelLabel} <CornerUpRight className="w-4 h-4 text-purple-400"/> Lv. {targetLevel}
                </h3>
                
                <p className="text-gray-300 mb-1">
                    <span className="font-bold">Needed:</span> {requirementMessage}
                </p>
                <p className="text-gray-300 mb-3">
                    <span className="font-bold">Fee:</span> {feeDisplay}
                </p>

                <div className="mb-4 text-sm">
                    <p className="text-gray-400">Approval Status for {contractToApprove}: {approvalStatus}</p>
                </div>

                {renderActionButton(false)}
            </div>
        );
    };

    const renderActionButton = (isOld: boolean) => {
        
        const isCurrentUpgradeReady = isOld 
            ? (balances.old1 ?? 0n) >= 1n && (balances.old2 ?? 0n) >= 1n
            : (balances.new1 ?? 0n) >= 2n;

        const needsApproval = isOld ? !isOldApproved : !isNewApproved;

        if (needsApproval) {
            const contractToApprove = isOld ? 'Old NFT' : 'New NFT';
            return (
                <button
                    onClick={() => handleApprove(isOld)}
                    disabled={isApproving}
                    className="w-full bg-yellow-500 hover:bg-yellow-600 py-2 rounded-xl text-black font-bold transition disabled:opacity-50"
                >
                    {isApproving ? "Approving..." : `Approve ${contractToApprove} Contract`}
                </button>
            );
        }
        
        if (!isCurrentUpgradeReady) {
            return <button disabled className="w-full bg-red-600 py-2 rounded-xl text-white font-bold">Insufficient NFT Balance</button>;
        }

        const feeToDisplay = isOld ? fees[1 as keyof typeof fees] : fees[2 as keyof typeof fees];
        
        return (
            <button
                onClick={handleUpgrade}
                disabled={isTxPending || !isConnected}
                className="w-full bg-purple-600 hover:bg-pink-600 py-2 rounded-xl text-white font-bold transition disabled:opacity-50"
            >
                {isTxPending 
                    ? `Processing...` 
                    : `Execute Upgrade (${Number(feeToDisplay) / 1e18} ETH)`}
            </button>
        );
    };

    const totalOldNft = (balances.old1 ?? 0n) + (balances.old2 ?? 0n);
    const totalNewNft = (balances.new1 ?? 0n) + (balances.new2 ?? 0n);

    const isOldUpgradeable = (balances.old1 ?? 0n) >= 1n && (balances.old2 ?? 0n) >= 1n;
    const isNew1Upgradeable = (balances.new1 ?? 0n) >= 2n;

    return (
        <div className="flex flex-col items-center min-h-screen p-4">
            <div className="bg-gray-900 border-purple-700 rounded-2xl shadow-lg p-6 max-w-2xl w-full text-center mx-auto">
                <h1 className="text-4xl font-bold text-pink-600 mb-4">
                    Monchil NFT Upgrade Center
                </h1>
                <p className="text-gray-400 mb-6 flex items-center justify-center gap-2">
                    <Diamond className="w-4 h-4 text-purple-400"/> Total Holdings: Old ({totalOldNft.toString()}) | New ({totalNewNft.toString()})
                </p>

                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
                    {renderNftCard('old1', NFT_CONFIG.old1.name, NFT_CONFIG.old1.image, balances.old1, 'ID: 1', isOldUpgradeable)}
                    
                    {renderNftCard('old2', NFT_CONFIG.old2.name, NFT_CONFIG.old2.image, balances.old2, 'ID: 2', isOldUpgradeable)}
                    
                    {renderNftCard('new1', NFT_CONFIG.new1.name, NFT_CONFIG.new1.image, balances.new1 ?? 0n, 'Lv: 1', isNew1Upgradeable)}
                    
                    {renderNftCard('new2', NFT_CONFIG.new2.name, NFT_CONFIG.new2.image, balances.new2 ?? 0n, 'Lv: 2', false)}
                </div>

                <div className="w-full">
                    {renderActionPanel()}
                </div>
            </div>
        </div>
    );
}