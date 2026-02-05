import React, { useState, useEffect } from 'react';
import { ethers } from 'ethers';
import toast, { Toaster } from 'react-hot-toast';
import { useAccount, usePublicClient, useWalletClient } from 'wagmi';
import tokenData from '../config/tokenList.json';
import routerAbi from '../abis/router.json';

const ERC20_ABI = [
  "function balanceOf(address account) public view returns (uint256)",
  "function decimals() public view returns (uint8)",
  "function approve(address spender, uint256 amount) public returns (bool)",
  "function allowance(address owner, address spender) public view returns (uint256)"
];

export const Swap = ({ routerAddr }: { account?: string, routerAddr: string }) => {
  // 1. Hooks Wagmi untuk koneksi universal 🔌
  const { address: account, isConnected } = useAccount();
  const publicClient = usePublicClient();
  const { data: walletClient } = useWalletClient();

  const [amountIn, setAmountIn] = useState('');
  const [amountOut, setAmountOut] = useState('0.0');
  const [rawAmountOut, setRawAmountOut] = useState<ethers.BigNumber>(ethers.BigNumber.from(0));
  const [tokenIn, setTokenIn] = useState("0x0000000000000000000000000000000000000000"); 
  const [tokenOut, setTokenOut] = useState(tokenData.tokens[3].address); 
  const [balanceIn, setBalanceIn] = useState('0.0');
  const [slippage, setSlippage] = useState('0.5');
  const [loading, setLoading] = useState(false);

  const NATIVE_ADDR = "0x0000000000000000000000000000000000000000";
  const WCLES_ADDR = "0xcfc4Fa68042509a239fA33f7A559860C875dCA70"; 
  const EXPLORER_URL = "https://testnet-explorer.celeschain.xyz/tx/";

  const getDecimals = (addr: string) => {
    if (addr === NATIVE_ADDR) return 18;
    const token = tokenData.tokens.find(t => t.address.toLowerCase() === addr.toLowerCase());
    return token ? token.decimals : 18;
  };

  // 2. Fetch balance menggunakan PublicClient Wagmi 🔍
  const fetchBalances = async () => {
    if (!account || !publicClient) return;
    try {
      if (tokenIn === NATIVE_ADDR) {
        const bal = await publicClient.getBalance({ address: account as `0x${string}` });
        setBalanceIn(ethers.utils.formatEther(bal));
      } else {
        const provider = new ethers.providers.Web3Provider(window.ethereum as any);
        const contract = new ethers.Contract(tokenIn, ERC20_ABI, provider);
        const bal = await contract.balanceOf(account);
        setBalanceIn(ethers.utils.formatUnits(bal, getDecimals(tokenIn)));
      }
    } catch (err) { console.error("Balance Error:", err); }
  };

  const calculateOutput = async (val: string) => {
    setAmountIn(val);
    if (!val || parseFloat(val) <= 0 || tokenIn === tokenOut || !publicClient) {
      setAmountOut('0.0');
      setRawAmountOut(ethers.BigNumber.from(0));
      return;
    }
    try {
      const provider = new ethers.providers.Web3Provider(window.ethereum as any);
      const router = new ethers.Contract(routerAddr, routerAbi, provider);
      const path = [
        tokenIn === NATIVE_ADDR ? WCLES_ADDR : tokenIn,
        tokenOut === NATIVE_ADDR ? WCLES_ADDR : tokenOut
      ];

      const amountsOut = await router.getAmountsOut(
        ethers.utils.parseUnits(val, getDecimals(tokenIn)), 
        path
      );
      
      setRawAmountOut(amountsOut[1]);
      setAmountOut(ethers.utils.formatUnits(amountsOut[1], getDecimals(tokenOut)));
    } catch (err) { 
      setAmountOut('No Liquidity'); 
    }
  };

  // 3. Handle Swap menggunakan WalletClient Wagmi ✍️
  const handleSwap = async () => {
    if (!amountIn || loading || !walletClient || !account) return;
    setLoading(true);
    const mainToast = toast.loading("Preparing transaction...");

    try {
      // Konversi WalletClient ke Ethers Signer agar kompatibel dengan kode lama Anda
      const provider = new ethers.providers.Web3Provider(walletClient as any);
      const signer = provider.getSigner();
      
      const router = new ethers.Contract(routerAddr, routerAbi, signer);
      const deadline = Math.floor(Date.now() / 1000) + 600;
      
      const decIn = getDecimals(tokenIn);
      const parsedIn = ethers.utils.parseUnits(amountIn, decIn);
      const slipFactor = 100 - parseFloat(slippage);
      const amountOutMin = rawAmountOut.mul(Math.floor(slipFactor * 100)).div(10000);

      const path = [
        tokenIn === NATIVE_ADDR ? WCLES_ADDR : tokenIn,
        tokenOut === NATIVE_ADDR ? WCLES_ADDR : tokenOut
      ];

      let tx;

      if (tokenIn === NATIVE_ADDR) {
        toast.loading("Confirm in your wallet...", { id: mainToast });
        tx = await router.swapExactETHForTokens(
          amountOutMin, path, account, deadline, { value: parsedIn }
        );
      } else {
        const contract = new ethers.Contract(tokenIn, ERC20_ABI, signer);
        const allowance = await contract.allowance(account, routerAddr);

        if (allowance.lt(parsedIn)) {
          toast.loading("Step 1/2: Approving Token...", { id: mainToast });
          const appTx = await contract.approve(routerAddr, ethers.constants.MaxUint256);
          await appTx.wait();
          toast.loading("Step 2/2: Confirming Swap...", { id: mainToast });
        } else {
          toast.loading("Confirming Swap...", { id: mainToast });
        }
        
        if (tokenOut === NATIVE_ADDR) {
          tx = await router.swapExactTokensForETH(parsedIn, amountOutMin, path, account, deadline);
        } else {
          tx = await router.swapExactTokensForTokens(parsedIn, amountOutMin, path, account, deadline);
        }
      }

      toast.loading("Broadcasting to CelesChain...", { id: mainToast });
      await tx.wait();
      
      toast.success("Swap Successful!", { id: mainToast, duration: 5000 });
      fetchBalances();
      setAmountIn('');
      setAmountOut('0.0');
    } catch (err: any) { 
      toast.error(err.reason || "Transaction Cancelled", { id: mainToast });
    }
    setLoading(false);
  };

  useEffect(() => { 
    if(isConnected) fetchBalances(); 
  }, [account, tokenIn, isConnected]);

  return (
    <div className="space-y-1 relative">
      <Toaster position="bottom-center" />
      
      {/* Slippage UI */}
      <div className="flex justify-end mb-2 px-2">
        <div className="flex items-center gap-2 text-[10px] text-slate-500 font-bold bg-black/20 px-3 py-1 rounded-lg border border-slate-800">
          <span className="opacity-50">SLIPPAGE:</span>
          <input type="text" value={slippage} onChange={(e) => setSlippage(e.target.value)} className="w-8 bg-transparent text-green-400 outline-none text-right" />%
        </div>
      </div>

      {/* Input Box */}
      <div className="bg-black/40 p-5 rounded-[2.5rem] border border-slate-800 hover:border-slate-700 transition-all group">
        <div className="flex justify-between text-[11px] text-slate-500 mb-3 font-bold uppercase tracking-tighter">
          <span>You Pay</span>
          <span className="cursor-pointer text-green-500/80 hover:text-green-400" onClick={() => calculateOutput(balanceIn)}>
            MAX: {parseFloat(balanceIn).toLocaleString(undefined, {maximumFractionDigits: 4})}
          </span>
        </div>
        <div className="flex items-center gap-3">
          <input type="number" placeholder="0.0" value={amountIn} onChange={(e) => calculateOutput(e.target.value)} className="bg-transparent text-3xl font-black outline-none w-full text-white placeholder-slate-800" />
          <select value={tokenIn} onChange={(e) => setTokenIn(e.target.value)} className="bg-slate-800 p-2.5 rounded-2xl text-[10px] font-black border border-slate-700 outline-none text-green-400 cursor-pointer">
            <option value={NATIVE_ADDR}>CLES</option>
            {tokenData.tokens.map(t => <option key={t.address} value={t.address}>{t.symbol}</option>)}
          </select>
        </div>
      </div>

      {/* Flip Button */}
      <div className="absolute left-1/2 -translate-x-1/2 top-[148px] z-20 bg-slate-900 border-[6px] border-slate-950 p-2.5 rounded-2xl text-green-500 shadow-2xl cursor-pointer hover:scale-110 active:scale-90 transition-all duration-200 group" 
           onClick={() => {
             const oldIn = tokenIn;
             setTokenIn(tokenOut);
             setTokenOut(oldIn);
             setAmountIn('');
             setAmountOut('0.0');
           }}>
        <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" fill="none" viewBox="0 0 24 24" stroke="currentColor" className="group-hover:rotate-180 transition-transform duration-500">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={4} d="M19 14l-7 7m0 0l-7-7m7 7V3" />
        </svg>
      </div>

      {/* Output Box */}
      <div className="bg-black/40 p-5 rounded-[2.5rem] border border-slate-800 pt-9 hover:border-slate-700 transition-all">
        <div className="flex justify-between text-[11px] text-slate-500 mb-3 font-bold uppercase tracking-widest">
          <span>You Receive</span>
        </div>
        <div className="flex items-center gap-3">
          <div className={`text-3xl font-black w-full truncate ${amountOut === 'No Liquidity' ? 'text-red-500 text-sm' : 'text-white'}`}>
            {amountOut}
          </div>
          <select value={tokenOut} onChange={(e) => setTokenOut(e.target.value)} className="bg-slate-800 p-2.5 rounded-2xl text-[10px] font-black border border-slate-700 outline-none text-green-400 cursor-pointer">
            <option value={NATIVE_ADDR}>CLES</option>
            {tokenData.tokens.map(t => <option key={t.address} value={t.address}>{t.symbol}</option>)}
          </select>
        </div>
      </div>

      <button 
        onClick={handleSwap} 
        disabled={!amountIn || loading || amountOut === 'No Liquidity' || !isConnected} 
        className="w-full bg-green-500 hover:bg-green-400 disabled:bg-slate-800 disabled:text-slate-600 text-black font-black py-5 rounded-[2.5rem] mt-4 transition-all shadow-xl shadow-green-500/5 active:scale-95 text-[11px] tracking-[0.2em] uppercase"
      >
        {!isConnected ? 'Connect Wallet' : loading ? 'Executing...' : 'Swap Assets'}
      </button>
    </div>
  );
};
