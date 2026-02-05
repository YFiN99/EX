import React, { useState, useEffect } from 'react';
import toast, { Toaster } from 'react-hot-toast';
import { 
  useAccount, 
  useBalance, 
  usePublicClient, 
  useWalletClient, 
  useReadContract,
  useWriteContract,
  useWaitForTransactionReceipt
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
  },
  {
    name: 'allowance',
    type: 'function',
    stateMutability: 'view',
    inputs: [
      { name: 'owner', type: 'address' },
      { name: 'spender', type: 'address' }
    ],
    outputs: [{ name: '', type: 'uint256' }],
  }
] as const;

export const Swap = ({ routerAddr }: { routerAddr: string }) => {
  const { address: account, isConnected } = useAccount();
  const publicClient = usePublicClient();
  const { data: walletClient } = useWalletClient();

  const [amountIn, setAmountIn] = useState('');
  const [amountOut, setAmountOut] = useState('0.0');
  const [tokenIn, setTokenIn] = useState("0x0000000000000000000000000000000000000000");
  const [tokenOut, setTokenOut] = useState(tokenData.tokens[3].address);
  const [balanceIn, setBalanceIn] = useState('0.0');
  const [slippage, setSlippage] = useState('0.5');
  const [loading, setLoading] = useState(false);

  const NATIVE_ADDR = "0x0000000000000000000000000000000000000000";
  const WCLES_ADDR = "0xcfc4Fa68042509a239fA33f7A559860C875dCA70";
  const EXPLORER_URL = "https://testnet-explorer.celeschain.xyz/tx/";

  // ── Saldo native (CLES) ────────────────────────────────────────
  const { data: nativeBalance } = useBalance({
    address: account,
    enabled: !!account && isConnected,
  });

  // ── Saldo token ERC-20 (jika tokenIn bukan native) ─────────────
  const { data: tokenBalanceRaw } = useReadContract({
    address: tokenIn as `0x${string}`,
    abi: ERC20_ABI,
    functionName: 'balanceOf',
    args: [account!],
    enabled: !!account && isConnected && tokenIn !== NATIVE_ADDR,
  });

  const { data: tokenDecimals } = useReadContract({
    address: tokenIn as `0x${string}`,
    abi: ERC20_ABI,
    functionName: 'decimals',
    enabled: !!account && isConnected && tokenIn !== NATIVE_ADDR,
  });

  // Update tampilan saldo
  useEffect(() => {
    if (!isConnected) {
      setBalanceIn('0.0');
      return;
    }

    if (tokenIn === NATIVE_ADDR) {
      setBalanceIn(nativeBalance?.formatted || '0.0');
    } else if (tokenBalanceRaw && tokenDecimals !== undefined) {
      setBalanceIn(formatUnits(tokenBalanceRaw, tokenDecimals));
    }
  }, [isConnected, tokenIn, nativeBalance, tokenBalanceRaw, tokenDecimals]);

  // ── Hitung output (getAmountsOut) ───────────────────────────────
  const calculateOutput = async (val: string) => {
    setAmountIn(val);

    if (!val || parseFloat(val) <= 0 || tokenIn === tokenOut || !publicClient) {
      setAmountOut('0.0');
      return;
    }

    try {
      const path = [
        tokenIn === NATIVE_ADDR ? WCLES_ADDR : tokenIn,
        tokenOut === NATIVE_ADDR ? WCLES_ADDR : tokenOut,
      ];

      const [amountOutRaw] = await publicClient.readContract({
        address: routerAddr as `0x${string}`,
        abi: routerAbi,
        functionName: 'getAmountsOut',
        args: [
          parseUnits(val, tokenIn === NATIVE_ADDR ? 18 : (tokenDecimals ?? 18)),
          path,
        ],
      });

      const outDecimals = tokenOut === NATIVE_ADDR ? 18 : (await publicClient.readContract({
        address: tokenOut as `0x${string}`,
        abi: ERC20_ABI,
        functionName: 'decimals',
      })) ?? 18;

      setAmountOut(formatUnits(amountOutRaw, outDecimals));
    } catch (err) {
      console.error(err);
      setAmountOut('No Liquidity');
    }
  };

  // ── Swap menggunakan writeContract ──────────────────────────────
  const { writeContractAsync } = useWriteContract();

  const handleSwap = async () => {
    if (!amountIn || loading || !walletClient || !account || !isConnected) return;
    setLoading(true);

    const toastId = toast.loading("Preparing transaction...");

    try {
      const decIn = tokenIn === NATIVE_ADDR ? 18 : (tokenDecimals ?? 18);
      const parsedIn = parseUnits(amountIn, decIn);

      const path = [
        tokenIn === NATIVE_ADDR ? WCLES_ADDR : tokenIn,
        tokenOut === NATIVE_ADDR ? WCLES_ADDR : tokenOut,
      ];

      const slippageTolerance = 100 - parseFloat(slippage);
      // Ambil estimasi output untuk hitung min
      const [estimatedOut] = await publicClient.readContract({
        address: routerAddr as `0x${string}`,
        abi: routerAbi,
        functionName: 'getAmountsOut',
        args: [parsedIn, path],
      });

      const amountOutMin = (estimatedOut * BigInt(Math.floor(slippageTolerance * 100))) / 10000n;

      let txHash: `0x${string}`;

      if (tokenIn === NATIVE_ADDR) {
        // swapExactETHForTokens
        toast.loading("Confirm in wallet...", { id: toastId });
        txHash = await writeContractAsync({
          address: routerAddr as `0x${string}`,
          abi: routerAbi,
          functionName: 'swapExactETHForTokens',
          args: [amountOutMin, path, account, BigInt(Math.floor(Date.now() / 1000) + 600)],
          value: parsedIn,
        });
      } else {
        // Cek allowance dulu
        const allowance = await publicClient.readContract({
          address: tokenIn as `0x${string}`,
          abi: ERC20_ABI,
          functionName: 'allowance',
          args: [account, routerAddr],
        });

        if (allowance < parsedIn) {
          toast.loading("Step 1/2: Approving token...", { id: toastId });
          const approveHash = await writeContractAsync({
            address: tokenIn as `0x${string}`,
            abi: ERC20_ABI,
            functionName: 'approve',
            args: [routerAddr, 2n ** 256n - 1n], // MaxUint256
          });
          await publicClient.waitForTransactionReceipt({ hash: approveHash });
          toast.loading("Step 2/2: Confirming swap...", { id: toastId });
        }

        if (tokenOut === NATIVE_ADDR) {
          // swapExactTokensForETH
          txHash = await writeContractAsync({
            address: routerAddr as `0x${string}`,
            abi: routerAbi,
            functionName: 'swapExactTokensForETH',
            args: [parsedIn, amountOutMin, path, account, BigInt(Math.floor(Date.now() / 1000) + 600)],
          });
        } else {
          // swapExactTokensForTokens
          txHash = await writeContractAsync({
            address: routerAddr as `0x${string}`,
            abi: routerAbi,
            functionName: 'swapExactTokensForTokens',
            args: [parsedIn, amountOutMin, path, account, BigInt(Math.floor(Date.now() / 1000) + 600)],
          });
        }
      }

      toast.loading("Waiting for confirmation...", { id: toastId });
      const receipt = await publicClient.waitForTransactionReceipt({ hash: txHash });

      toast.success(
        <div>
          Swap successful!{' '}
          <a
            href={`${EXPLORER_URL}${txHash}`}
            target="_blank"
            rel="noopener noreferrer"
            className="underline"
          >
            View on explorer
          </a>
        </div>,
        { id: toastId, duration: 8000 }
      );

      // Reset
      setAmountIn('');
      setAmountOut('0.0');
      // saldo akan update otomatis via useEffect
    } catch (err: any) {
      toast.error(err.shortMessage || err.message || "Transaction failed", { id: toastId });
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-1 relative">
      <Toaster position="bottom-center" />

      {/* Slippage UI */}
      <div className="flex justify-end mb-2 px-2">
        <div className="flex items-center gap-2 text-[10px] text-slate-500 font-bold bg-black/20 px-3 py-1 rounded-lg border border-slate-800">
          <span className="opacity-50">SLIPPAGE:</span>
          <input
            type="text"
            value={slippage}
            onChange={(e) => setSlippage(e.target.value)}
            className="w-8 bg-transparent text-green-400 outline-none text-right"
          />
          %
        </div>
      </div>

      {/* Input Box */}
      <div className="bg-black/40 p-5 rounded-[2.5rem] border border-slate-800 hover:border-slate-700 transition-all group">
        <div className="flex justify-between text-[11px] text-slate-500 mb-3 font-bold uppercase tracking-tighter">
          <span>You Pay</span>
          <span
            className="cursor-pointer text-green-500/80 hover:text-green-400"
            onClick={() => {
              if (isConnected) setAmountIn(balanceIn);
            }}
          >
            MAX: {parseFloat(balanceIn).toLocaleString(undefined, { maximumFractionDigits: 4 })}
          </span>
        </div>
        <div className="flex items-center gap-3">
          <input
            type="number"
            placeholder="0.0"
            value={amountIn}
            onChange={(e) => calculateOutput(e.target.value)}
            className="bg-transparent text-3xl font-black outline-none w-full text-white placeholder-slate-800"
          />
          <select
            value={tokenIn}
            onChange={(e) => setTokenIn(e.target.value)}
            className="bg-slate-800 p-2.5 rounded-2xl text-[10px] font-black border border-slate-700 outline-none text-green-400 cursor-pointer"
          >
            <option value={NATIVE_ADDR}>CLES</option>
            {tokenData.tokens.map(t => (
              <option key={t.address} value={t.address}>
                {t.symbol}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Flip Button */}
      <div
        className="absolute left-1/2 -translate-x-1/2 top-[148px] z-20 bg-slate-900 border-[6px] border-slate-950 p-2.5 rounded-2xl text-green-500 shadow-2xl cursor-pointer hover:scale-110 active:scale-90 transition-all duration-200 group"
        onClick={() => {
          const oldIn = tokenIn;
          setTokenIn(tokenOut);
          setTokenOut(oldIn);
          setAmountIn('');
          setAmountOut('0.0');
        }}
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          width="18"
          height="18"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          className="group-hover:rotate-180 transition-transform duration-500"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={4} d="M19 14l-7 7m0 0l-7-7m7 7V3" />
        </svg>
      </div>

      {/* Output Box */}
      <div className="bg-black/40 p-5 rounded-[2.5rem] border border-slate-800 pt-9 hover:border-slate-700 transition-all">
        <div className="flex justify-between text-[11px] text-slate-500 mb-3 font-bold uppercase tracking-widest">
          <span>You Receive</span>
        </div>
        <div className="flex items-center gap-3">
          <div
            className={`text-3xl font-black w-full truncate ${
              amountOut === 'No Liquidity' ? 'text-red-500 text-sm' : 'text-white'
            }`}
          >
            {amountOut}
          </div>
          <select
            value={tokenOut}
            onChange={(e) => setTokenOut(e.target.value)}
            className="bg-slate-800 p-2.5 rounded-2xl text-[10px] font-black border border-slate-700 outline-none text-green-400 cursor-pointer"
          >
            <option value={NATIVE_ADDR}>CLES</option>
            {tokenData.tokens.map(t => (
              <option key={t.address} value={t.address}>
                {t.symbol}
              </option>
            ))}
          </select>
        </div>
      </div>

      <button
        onClick={handleSwap}
        disabled={!amountIn || loading || amountOut === 'No Liquidity' || !isConnected}
        className="w-full bg-green-500 hover:bg-green-400 disabled:bg-slate-800 disabled:text-slate-600 text-black font-black py-5 rounded-[2.5rem] mt-4 transition-all shadow-xl shadow-green-500/5 active:scale-95 text-[11px] tracking-[0.2em] uppercase"
      >
        {!isConnected
          ? 'Connect Wallet'
          : loading
          ? 'Executing...'
          : 'Swap Assets'}
      </button>
    </div>
  );
};
