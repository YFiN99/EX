import React, { useState, useEffect, useCallback } from 'react';
import { ethers } from 'ethers';
import toast, { Toaster } from 'react-hot-toast';
import { useAccount, usePublicClient, useWalletClient } from 'wagmi';
import { parseAbi, getAddress } from 'viem';

import tokenData from '../config/tokenList.json';
import routerAbiRaw from '../abis/router.json';

const routerAbi = parseAbi(routerAbiRaw);
const ERC20_ABI = parseAbi([
  "function balanceOf(address account) public view returns (uint256)",
  "function decimals() public view returns (uint8)",
  "function approve(address spender, uint256 amount) public returns (bool)",
  "function allowance(address owner, address spender) public view returns (uint256)"
]);

const Swap = ({ routerAddr }) => {
  const { address: account, isConnected } = useAccount();
  const publicClient = usePublicClient();
  const { data: walletClient } = useWalletClient();

  const [amountIn, setAmountIn] = useState('');
  const [amountOut, setAmountOut] = useState('0.0');
  const [rawAmountOut, setRawAmountOut] = useState(0n);
  const [tokenIn, setTokenIn] = useState("0x0000000000000000000000000000000000000000");
  const [tokenOut, setTokenOut] = useState(tokenData.tokens[3]?.address || "");
  const [balanceIn, setBalanceIn] = useState('0.0');
  const [slippage, setSlippage] = useState('0.5');
  const [loading, setLoading] = useState(false);

  const NATIVE_ADDR = "0x0000000000000000000000000000000000000000";
  const WCLES_ADDR = "0xcfc4Fa68042509a239fA33f7A559860C875dCA70";

  const safeAddr = (addr) => (addr === NATIVE_ADDR ? addr : getAddress(addr));

  const getDecimals = (addr) => {
    if (addr === NATIVE_ADDR) return 18;
    const token = tokenData.tokens.find((t) => t.address.toLowerCase() === addr.toLowerCase());
    return token ? token.decimals : 18;
  };

  const fetchBalances = useCallback(async () => {
    if (!account || !publicClient) return;
    try {
      if (tokenIn === NATIVE_ADDR) {
        const bal = await publicClient.getBalance({ address: account });
        setBalanceIn(ethers.formatEther(bal));
      } else {
        const bal = await publicClient.readContract({
          address: safeAddr(tokenIn),
          abi: ERC20_ABI,
          functionName: 'balanceOf',
          args: [account],
        });
        setBalanceIn(ethers.formatUnits(bal, getDecimals(tokenIn)));
      }
    } catch (err) {
      console.error("Error fetching balance:", err);
    }
  }, [account, publicClient, tokenIn]);

  const calculateOutput = async (val) => {
    setAmountIn(val);
    if (!val || parseFloat(val) <= 0 || tokenIn === tokenOut || !publicClient || !routerAddr) {
      setAmountOut('0.0');
      setRawAmountOut(0n);
      return;
    }
    try {
      const path = [
        tokenIn === NATIVE_ADDR ? WCLES_ADDR : safeAddr(tokenIn),
        tokenOut === NATIVE_ADDR ? WCLES_ADDR : safeAddr(tokenOut),
      ];
      const amountsOut = await publicClient.readContract({
        address: safeAddr(routerAddr),
        abi: routerAbi,
        functionName: 'getAmountsOut',
        args: [ethers.parseUnits(val, getDecimals(tokenIn)), path],
      });
      setRawAmountOut(amountsOut[1]);
      setAmountOut(ethers.formatUnits(amountsOut[1], getDecimals(tokenOut)));
    } catch (err) {
      setAmountOut('No Liquidity');
    }
  };

  const handleSwap = async () => {
    if (!amountIn || loading || !walletClient || !account || !routerAddr) return;
    
    setLoading(true);
    const mainToast = toast.loading("Preparing Swap...");
    
    try {
      const deadline = BigInt(Math.floor(Date.now() / 1000) + 600);
      const parsedIn = ethers.parseUnits(amountIn, getDecimals(tokenIn));
      const slipNumerator = BigInt(Math.floor((100 - parseFloat(slippage)) * 100));
      const amountOutMin = (rawAmountOut * slipNumerator) / 10000n;

      const path = [
        tokenIn === NATIVE_ADDR ? WCLES_ADDR : safeAddr(tokenIn),
        tokenOut === NATIVE_ADDR ? WCLES_ADDR : safeAddr(tokenOut),
      ];

      // 1. HANDLE APPROVAL
      if (tokenIn !== NATIVE_ADDR) {
        const allowance = await publicClient.readContract({
          address: safeAddr(tokenIn), 
          abi: ERC20_ABI, 
          functionName: 'allowance', 
          args: [account, safeAddr(routerAddr)],
        });

        if (BigInt(allowance) < parsedIn) {
          toast.loading("Approving Token...", { id: mainToast });
          const { hash: appHash } = await walletClient.writeContract({
            address: safeAddr(tokenIn), 
            abi: ERC20_ABI, 
            functionName: 'approve', 
            args: [safeAddr(routerAddr), ethers.MaxUint256],
          });
          await publicClient.waitForTransactionReceipt({ hash: appHash, timeout: 20_000 }).catch(() => null);
        }
      }

      // 2. SEND SWAP TRANSACTION
      toast.loading("Waiting for Metamask...", { id: mainToast });
      
      let txHash;
      const config = { address: safeAddr(routerAddr), abi: routerAbi, account };

      if (tokenIn === NATIVE_ADDR) {
        const { hash } = await walletClient.writeContract({
          ...config,
          functionName: 'swapExactETHForTokens',
          args: [amountOutMin, path, account, deadline],
          value: parsedIn,
        });
        txHash = hash;
      } else {
        const fn = tokenOut === NATIVE_ADDR ? 'swapExactTokensForETH' : 'swapExactTokensForTokens';
        const { hash } = await walletClient.writeContract({
          ...config,
          functionName: fn,
          args: [parsedIn, amountOutMin, path, account, deadline],
        });
        txHash = hash;
      }

      // --- OPTIMISTIC UPDATE: BYPASS DELAY ---
      toast.success("Transaction Sent! Refreshing balances...", { id: mainToast });
      setLoading(false); // Matikan loading segera setelah hash didapat
      setAmountIn('');
      setAmountOut('0.0');

      // POLLING: Cek saldo setiap 3 detik selama 15 detik (5x cek)
      let pollCount = 0;
      const pollInterval = setInterval(() => {
        fetchBalances();
        pollCount++;
        if (pollCount >= 5) clearInterval(pollInterval);
      }, 3000);

      // Background confirmation (tanpa menghalangi UI)
      publicClient.waitForTransactionReceipt({ hash: txHash })
        .then(() => {
          fetchBalances();
          toast.success("Transaction Confirmed on Block!");
        })
        .catch(() => console.debug("Silent timeout on receipt"));

    } catch (err) {
      console.error("Swap Error:", err);
      toast.error(err.shortMessage || "Transaction failed", { id: mainToast });
      setLoading(false); // Reset loading jika user menolak/error
    }
  };

  useEffect(() => { 
    if (isConnected) fetchBalances(); 
  }, [isConnected, account, tokenIn, fetchBalances]);

  return (
    <div className="space-y-1 relative">
      <Toaster position="bottom-center" />
      <div className="flex justify-end mb-2 px-2">
        <div className="flex items-center gap-2 text-[10px] text-slate-500 font-bold bg-black/20 px-3 py-1 rounded-lg border border-slate-800">
          <span>SLIPPAGE:</span>
          <input type="text" value={slippage} onChange={(e) => setSlippage(e.target.value)} className="w-8 bg-transparent text-green-400 outline-none text-right" />%
        </div>
      </div>

      <div className="bg-black/40 p-5 rounded-[2.5rem] border border-slate-800 hover:border-slate-700 transition-all">
        <div className="flex justify-between text-[11px] text-slate-500 mb-3 font-bold uppercase">
          <span>You Pay</span>
          <span className="cursor-pointer text-green-500/80" onClick={() => calculateOutput(balanceIn)}>MAX: {parseFloat(balanceIn).toFixed(4)}</span>
        </div>
        <div className="flex items-center gap-3">
          <input type="number" placeholder="0.0" value={amountIn} onChange={(e) => calculateOutput(e.target.value)} className="bg-transparent text-3xl font-black outline-none w-full text-white" />
          <select value={tokenIn} onChange={(e) => {setTokenIn(e.target.value); setAmountIn('');}} className="bg-slate-800 p-2.5 rounded-2xl text-[10px] font-black text-green-400">
            <option value={NATIVE_ADDR}>CLES</option>
            {tokenData.tokens.map((t) => <option key={t.address} value={t.address}>{t.symbol}</option>)}
          </select>
        </div>
      </div>

      <div className="absolute left-1/2 -translate-x-1/2 top-[148px] z-20 bg-slate-900 border-[6px] border-slate-950 p-2.5 rounded-2xl text-green-500 cursor-pointer hover:scale-110 transition-transform" 
           onClick={() => { setTokenIn(tokenOut); setTokenOut(tokenIn); setAmountIn(''); }}>
        <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={4} d="M19 14l-7 7m0 0l-7-7m7 7V3" /></svg>
      </div>

      <div className="bg-black/40 p-5 rounded-[2.5rem] border border-slate-800 pt-9">
        <div className="flex justify-between text-[11px] text-slate-500 mb-3 font-bold uppercase"><span>You Receive</span></div>
        <div className="flex items-center gap-3">
          <div className={`text-3xl font-black w-full truncate ${amountOut === 'No Liquidity' ? 'text-red-500 text-sm' : 'text-white'}`}>{amountOut}</div>
          <select value={tokenOut} onChange={(e) => setTokenOut(e.target.value)} className="bg-slate-800 p-2.5 rounded-2xl text-[10px] font-black text-green-400">
            <option value={NATIVE_ADDR}>CLES</option>
            {tokenData.tokens.map((t) => <option key={t.address} value={t.address}>{t.symbol}</option>)}
          </select>
        </div>
      </div>

      <button 
        onClick={handleSwap} 
        disabled={!amountIn || loading || amountOut === 'No Liquidity' || !isConnected} 
        className="w-full bg-green-500 hover:bg-green-400 disabled:bg-slate-800 disabled:text-slate-600 text-black font-black py-5 rounded-[2.5rem] mt-4 transition-all text-[11px] uppercase tracking-widest shadow-lg active:scale-[0.98]"
      >
        {!isConnected ? 'Connect Wallet' : loading ? 'Processing...' : 'Swap Assets'}
      </button>
    </div>
  );
};

export default Swap;