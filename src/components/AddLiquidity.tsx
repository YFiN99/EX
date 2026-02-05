import React, { useState, useEffect } from 'react';
import { ethers } from 'ethers';
import toast, { Toaster } from 'react-hot-toast';
import { useAccount, usePublicClient, useWalletClient } from 'wagmi';
import tokenData from '../config/tokenList.json';
import routerAbi from '../abis/router.json';

const ERC20_ABI = [
  "function approve(address spender, uint256 amount) public returns (bool)",
  "function balanceOf(address account) public view returns (uint256)",
  "function decimals() public view returns (uint8)"
];

export const AddLiquidity = ({ routerAddr }: { account?: string, routerAddr: string }) => {
  // 1. Inisialisasi Wagmi Hooks 🔌
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

  const fetchBalances = async () => {
    if (!account || !publicClient) return;
    try {
      // Kita gunakan provider Ethers yang dibungkus dari window.ethereum untuk pembacaan data
      // Namun tetap dipicu oleh state akun dari Wagmi
      const provider = new ethers.providers.Web3Provider(window.ethereum as any);
      
      // Balance A
      if (tokenA === NATIVE_ADDR) {
        const bal = await publicClient.getBalance({ address: account as `0x${string}` });
        setBalanceA(ethers.utils.formatEther(bal));
      } else {
        const contract = new ethers.Contract(tokenA, ERC20_ABI, provider);
        const [bal, dec] = await Promise.all([contract.balanceOf(account), contract.decimals()]);
        setBalanceA(ethers.utils.formatUnits(bal, dec));
      }

      // Balance B
      if (tokenB === NATIVE_ADDR) {
        const bal = await publicClient.getBalance({ address: account as `0x${string}` });
        setBalanceB(ethers.utils.formatEther(bal));
      } else {
        const contract = new ethers.Contract(tokenB, ERC20_ABI, provider);
        const [bal, dec] = await Promise.all([contract.balanceOf(account), contract.decimals()]);
        setBalanceB(ethers.utils.formatUnits(bal, dec));
      }
    } catch (err) { console.error(err); }
  };

  useEffect(() => { 
    if (isConnected) fetchBalances(); 
  }, [account, tokenA, tokenB, isConnected]);

  const handleAddLiquidity = async () => {
    if (!walletClient || !account) return toast.error("Connect your wallet first");
    if (!amountA || !amountB) return toast.error("Please enter amounts for both tokens");
    
    setLoading(true);
    const mainToast = toast.loading("Initializing transaction...");

    try {
      // 2. Konversi ke Signer Ethers ✍️
      const provider = new ethers.providers.Web3Provider(walletClient as any);
      const signer = provider.getSigner();
      const router = new ethers.Contract(routerAddr, routerAbi, signer);
      const deadline = Math.floor(Date.now() / 1000) + 600;

      let tx;

      if (tokenA === NATIVE_ADDR || tokenB === NATIVE_ADDR) {
        const isA = tokenA === NATIVE_ADDR;
        const tokenToken = isA ? tokenB : tokenA;
        const tokenAmount = isA ? amountB : amountA;
        const ethAmount = isA ? amountA : amountB;

        const tokenContract = new ethers.Contract(tokenToken, ERC20_ABI, signer);
        const dec = await tokenContract.decimals();
        const pTokenAmount = ethers.utils.parseUnits(tokenAmount, dec);
        const pEthAmount = ethers.utils.parseEther(ethAmount);

        toast.loading("Step 1/2: Approving Token...", { id: mainToast });
        const appTx = await tokenContract.approve(routerAddr, pTokenAmount);
        await appTx.wait();

        toast.loading("Step 2/2: Confirming Supply...", { id: mainToast });
        tx = await router.addLiquidityETH(
          tokenToken, pTokenAmount, 0, 0, account, deadline, 
          { value: pEthAmount }
        );

      } else {
        const contractA = new ethers.Contract(tokenA, ERC20_ABI, signer);
        const contractB = new ethers.Contract(tokenB, ERC20_ABI, signer);
        const [decA, decB] = await Promise.all([contractA.decimals(), contractB.decimals()]);
        const pA = ethers.utils.parseUnits(amountA, decA);
        const pB = ethers.utils.parseUnits(amountB, decB);

        toast.loading("Step 1/3: Approving Token A...", { id: mainToast });
        await (await contractA.approve(routerAddr, pA)).wait();
        toast.loading("Step 2/3: Approving Token B...", { id: mainToast });
        await (await contractB.approve(routerAddr, pB)).wait();

        toast.loading("Step 3/3: Confirming Supply...", { id: mainToast });
        tx = await router.addLiquidity(tokenA, tokenB, pA, pB, 0, 0, account, deadline);
      }

      toast.loading(
        (t) => (
          <div className="flex flex-col gap-1">
            <span>Transaction Pending...</span>
            <a href={`${EXPLORER_URL}${tx.hash}`} target="_blank" rel="noreferrer" className="text-blue-400 underline text-[10px]">
              View on Explorer
            </a>
          </div>
        ), 
        { id: mainToast }
      );

      await tx.wait();
      toast.success("Liquidity Added Successfully!", { id: mainToast, duration: 5000 });
      fetchBalances();
      setAmountA('');
      setAmountB('');

    } catch (err: any) {
      toast.error(err.reason || "Transaction failed", { id: mainToast });
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
          <span className="text-green-500 cursor-pointer hover:text-green-400" onClick={() => setAmountA(balanceA)}>
            Balance: {parseFloat(balanceA).toLocaleString(undefined, {minimumFractionDigits: 4})}
          </span>
        </div>
        <div className="flex items-center gap-3">
          <input type="number" placeholder="0.0" value={amountA} onChange={(e) => setAmountA(e.target.value)} className="bg-transparent text-2xl font-black outline-none w-full text-white" />
          <select value={tokenA} onChange={(e) => setTokenA(e.target.value)} className="bg-slate-800 p-2 rounded-xl text-[10px] font-bold border border-slate-700 outline-none cursor-pointer">
            <option value={NATIVE_ADDR}>CLES (Native)</option>
            {tokenData.tokens.map(t => <option key={t.address} value={t.address}>{t.symbol}</option>)}
          </select>
        </div>
      </div>

      <div className="flex justify-center -my-3 relative z-10">
         <div className="bg-slate-900 border border-slate-800 p-1.5 rounded-full text-[10px] shadow-lg shadow-black/50">➕</div>
      </div>

      {/* CARD TOKEN B */}
      <div className="bg-black/20 p-4 rounded-3xl border border-slate-800/50 hover:border-green-500/30 transition-all group">
        <div className="flex justify-between text-[10px] font-bold text-slate-500 mb-2 uppercase">
          <span>Input Token B</span>
          <span className="text-green-500 cursor-pointer hover:text-green-400" onClick={() => setAmountB(balanceB)}>
            Balance: {parseFloat(balanceB).toLocaleString(undefined, {minimumFractionDigits: 4})}
          </span>
        </div>
        <div className="flex items-center gap-3">
          <input type="number" placeholder="0.0" value={amountB} onChange={(e) => setAmountB(e.target.value)} className="bg-transparent text-2xl font-black outline-none w-full text-white" />
          <select value={tokenB} onChange={(e) => setTokenB(e.target.value)} className="bg-slate-800 p-2 rounded-xl text-[10px] font-bold border border-slate-700 outline-none cursor-pointer">
            <option value={NATIVE_ADDR}>CLES (Native)</option>
            {tokenData.tokens.map(t => <option key={t.address} value={t.address}>{t.symbol}</option>)}
          </select>
        </div>
      </div>

      <button 
        onClick={handleAddLiquidity}
        disabled={loading || !amountA || !amountB || !isConnected}
        className="w-full bg-green-500 hover:bg-green-400 disabled:bg-slate-800 disabled:text-slate-600 text-black font-black py-5 rounded-[2rem] mt-4 transition-all active:scale-95 uppercase text-[11px] tracking-widest shadow-lg shadow-green-900/10"
      >
        {!isConnected ? 'Connect Wallet' : loading ? 'Executing Transactions...' : 'Supply Liquidity'}
      </button>

      <div className="h-4"></div>
    </div>
  );
};
