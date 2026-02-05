import React, { useState, useEffect } from 'react';
import toast, { Toaster } from 'react-hot-toast';
import { 
  useAccount,
  usePublicClient,
  useWalletClient,
  useReadContract,
  useWriteContract
} from 'wagmi';
import { parseUnits, formatUnits } from 'viem';
import tokenData from '../config/tokenList.json';
import routerAbi from '../abis/router.json';

const ERC20_ABI = [
  {
    name: 'balanceOf',
    type: 'function',
    stateMutability: 'view',
    inputs: [{ name: 'account', type: 'address' }],
    outputs: [{ name: '', type: 'uint256' }],
  },
  {
    name: 'decimals',
    type: 'function',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ name: '', type: 'uint8' }],
  },
  {
    name: 'approve',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'spender', type: 'address' },
      { name: 'amount', type: 'uint256' }
    ],
    outputs: [{ name: '', type: 'bool' }],
  }
] as const;

const ROUTER_ABI = routerAbi; // pastikan ABI ini sudah benar

export const AddLiquidity = ({ routerAddr }: { routerAddr: string }) => {
  const { address: account, isConnected } = useAccount();
  const publicClient = usePublicClient();
  const { data: walletClient } = useWalletClient();

  const [amountA, setAmountA] = useState('');
  const [amountB, setAmountB] = useState('');
  const [tokenA, setTokenA] = useState("0x0000000000000000000000000000000000000000");
  const [tokenB, setTokenB] = useState(tokenData.tokens[3].address);
  const [balanceA, setBalanceA] = useState('0.0');
  const [balanceB, setBalanceB] = useState('0.0');
  const [loading, setLoading] = useState(false);

  const NATIVE_ADDR = "0x0000000000000000000000000000000000000000";
  const EXPLORER_URL = "https://testnet-explorer.celeschain.xyz/tx/";

  // ── Saldo Token A ──────────────────────────────────────────────
  const { data: balanceARaw } = useReadContract({
    address: tokenA as `0x${string}`,
    abi: ERC20_ABI,
    functionName: 'balanceOf',
    args: [account!],
    enabled: !!account && isConnected && tokenA !== NATIVE_ADDR,
  });

  const { data: decimalsA } = useReadContract({
    address: tokenA as `0x${string}`,
    abi: ERC20_ABI,
    functionName: 'decimals',
    enabled: !!account && isConnected && tokenA !== NATIVE_ADDR,
  });

  // ── Saldo Token B ──────────────────────────────────────────────
  const { data: balanceBRaw } = useReadContract({
    address: tokenB as `0x${string}`,
    abi: ERC20_ABI,
    functionName: 'balanceOf',
    args: [account!],
    enabled: !!account && isConnected && tokenB !== NATIVE_ADDR,
  });

  const { data: decimalsB } = useReadContract({
    address: tokenB as `0x${string}`,
    abi: ERC20_ABI,
    functionName: 'decimals',
    enabled: !!account && isConnected && tokenB !== NATIVE_ADDR,
  });

  // ── Saldo Native (CLES) ────────────────────────────────────────
  const { data: nativeBalance } = useBalance({
    address: account,
    enabled: !!account && isConnected,
  });

  // Update tampilan saldo
  useEffect(() => {
    if (!isConnected) {
      setBalanceA('0.0');
      setBalanceB('0.0');
      return;
    }

    // Token A
    if (tokenA === NATIVE_ADDR) {
      setBalanceA(nativeBalance?.formatted || '0.0');
    } else if (balanceARaw && decimalsA !== undefined) {
      setBalanceA(formatUnits(balanceARaw, decimalsA));
    }

    // Token B
    if (tokenB === NATIVE_ADDR) {
      setBalanceB(nativeBalance?.formatted || '0.0');
    } else if (balanceBRaw && decimalsB !== undefined) {
      setBalanceB(formatUnits(balanceBRaw, decimalsB));
    }
  }, [isConnected, tokenA, tokenB, nativeBalance, balanceARaw, decimalsA, balanceBRaw, decimalsB]);

  const { writeContractAsync } = useWriteContract();

  const handleAddLiquidity = async () => {
    if (!isConnected || !account || !publicClient || !walletClient) {
      return toast.error("Please connect your wallet");
    }

    if (!amountA || !amountB || parseFloat(amountA) <= 0 || parseFloat(amountB) <= 0) {
      return toast.error("Please enter valid amounts for both tokens");
    }

    setLoading(true);
    const tId = toast.loading("Preparing transaction...");

    try {
      const deadline = BigInt(Math.floor(Date.now() / 1000) + 600);

      let txHash: `0x${string}`;

      if (tokenA === NATIVE_ADDR || tokenB === NATIVE_ADDR) {
        const isA = tokenA === NATIVE_ADDR;
        const tokenAddr = isA ? tokenB : tokenA;
        const tokenAmountStr = isA ? amountB : amountA;
        const ethAmountStr = isA ? amountA : amountB;

        const tokenDecimals = isA ? decimalsB ?? 18 : decimalsA ?? 18;
        const tokenAmount = parseUnits(tokenAmountStr, tokenDecimals);
        const ethAmount = parseEther(ethAmountStr);

        // APPROVE token (jika bukan native)
        toast.loading("Step 1/2: Approving token...", { id: tId });

        const approveHash = await writeContractAsync({
          address: tokenAddr,
          abi: ERC20_ABI,
          functionName: 'approve',
          args: [routerAddr, tokenAmount],
        });

        await publicClient.waitForTransactionReceipt({ hash: approveHash });

        // ADD LIQUIDITY ETH
        toast.loading("Step 2/2: Confirming supply...", { id: tId });

        txHash = await writeContractAsync({
          address: routerAddr,
          abi: ROUTER_ABI,
          functionName: 'addLiquidityETH',
          args: [
            tokenAddr,
            tokenAmount,
            0n, // amountTokenMin
            0n, // amountETHMin
            account,
            deadline
          ],
          value: ethAmount,
        });
      } else {
        // Kedua token adalah ERC-20
        const amountAWei = parseUnits(amountA, decimalsA ?? 18);
        const amountBWei = parseUnits(amountB, decimalsB ?? 18);

        // APPROVE A
        toast.loading("Step 1/3: Approving Token A...", { id: tId });
        const approveAHash = await writeContractAsync({
          address: tokenA,
          abi: ERC20_ABI,
          functionName: 'approve',
          args: [routerAddr, amountAWei],
        });
        await publicClient.waitForTransactionReceipt({ hash: approveAHash });

        // APPROVE B
        toast.loading("Step 2/3: Approving Token B...", { id: tId });
        const approveBHash = await writeContractAsync({
          address: tokenB,
          abi: ERC20_ABI,
          functionName: 'approve',
          args: [routerAddr, amountBWei],
        });
        await publicClient.waitForTransactionReceipt({ hash: approveBHash });

        // ADD LIQUIDITY
        toast.loading("Step 3/3: Confirming supply...", { id: tId });

        txHash = await writeContractAsync({
          address: routerAddr,
          abi: ROUTER_ABI,
          functionName: 'addLiquidity',
          args: [
            tokenA,
            tokenB,
            amountAWei,
            amountBWei,
            0n, // amountAMin
            0n, // amountBMin
            account,
            deadline
          ],
        });
      }

      toast.loading(
        <div className="flex flex-col gap-1">
          <span>Waiting for confirmation...</span>
          <a
            href={`${EXPLORER_URL}${txHash}`}
            target="_blank"
            rel="noopener noreferrer"
            className="text-blue-400 underline text-[10px]"
          >
            View on Explorer
          </a>
        </div>,
        { id: tId }
      );

      const receipt = await publicClient.waitForTransactionReceipt({ hash: txHash });

      if (receipt.status === 'success') {
        toast.success("Liquidity added successfully!", { id: tId, duration: 5000 });
        setAmountA('');
        setAmountB('');
      } else {
        toast.error("Transaction reverted", { id: tId });
      }
    } catch (err: any) {
      toast.error(err.shortMessage || err.message || "Failed to add liquidity", { id: tId });
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-2">
      <Toaster position="bottom-center" />

      {/* CARD TOKEN A */}
      <div className="bg-black/20 p-4 rounded-3xl border border-slate-800/50 hover:border-green-500/30 transition-all group">
        <div className="flex justify-between text-[10px] font-bold text-slate-500 mb-2 uppercase">
          <span>Input Token A</span>
          <span 
            className="text-green-500 cursor-pointer hover:text-green-400"
            onClick={() => setAmountA(balanceA)}
          >
            Balance: {parseFloat(balanceA).toLocaleString(undefined, { minimumFractionDigits: 4 })}
          </span>
        </div>
        <div className="flex items-center gap-3">
          <input
            type="number"
            placeholder="0.0"
            value={amountA}
            onChange={(e) => setAmountA(e.target.value)}
            className="bg-transparent text-2xl font-black outline-none w-full text-white"
          />
          <select
            value={tokenA}
            onChange={(e) => setTokenA(e.target.value)}
            className="bg-slate-800 p-2 rounded-xl text-[10px] font-bold border border-slate-700 outline-none cursor-pointer"
          >
            <option value={NATIVE_ADDR}>CLES (Native)</option>
            {tokenData.tokens.map(t => (
              <option key={t.address} value={t.address}>
                {t.symbol}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="flex justify-center -my-3 relative z-10">
        <div className="bg-slate-900 border border-slate-800 p-1.5 rounded-full text-[10px] shadow-lg shadow-black/50">
          ➕
        </div>
      </div>

      {/* CARD TOKEN B */}
      <div className="bg-black/20 p-4 rounded-3xl border border-slate-800/50 hover:border-green-500/30 transition-all group">
        <div className="flex justify-between text-[10px] font-bold text-slate-500 mb-2 uppercase">
          <span>Input Token B</span>
          <span 
            className="text-green-500 cursor-pointer hover:text-green-400"
            onClick={() => setAmountB(balanceB)}
          >
            Balance: {parseFloat(balanceB).toLocaleString(undefined, { minimumFractionDigits: 4 })}
          </span>
        </div>
        <div className="flex items-center gap-3">
          <input
            type="number"
            placeholder="0.0"
            value={amountB}
            onChange={(e) => setAmountB(e.target.value)}
            className="bg-transparent text-2xl font-black outline-none w-full text-white"
          />
          <select
            value={tokenB}
            onChange={(e) => setTokenB(e.target.value)}
            className="bg-slate-800 p-2 rounded-xl text-[10px] font-bold border border-slate-700 outline-none cursor-pointer"
          >
            <option value={NATIVE_ADDR}>CLES (Native)</option>
            {tokenData.tokens.map(t => (
              <option key={t.address} value={t.address}>
                {t.symbol}
              </option>
            ))}
          </select>
        </div>
      </div>

      <button
        onClick={handleAddLiquidity}
        disabled={loading || !amountA || !amountB || !isConnected}
        className="w-full bg-green-500 hover:bg-green-400 disabled:bg-slate-800 disabled:text-slate-600 text-black font-black py-5 rounded-[2rem] mt-4 transition-all active:scale-95 uppercase text-[11px] tracking-widest shadow-lg shadow-green-900/10"
      >
        {!isConnected 
          ? 'Connect Wallet' 
          : loading 
          ? 'Executing Transactions...' 
          : 'Supply Liquidity'}
      </button>

      <div className="h-4"></div>
    </div>
  );
};
