import React, { useState, useEffect, useCallback } from 'react';
import { ethers } from 'ethers';
import toast, { Toaster } from 'react-hot-toast';
import { useAccount, usePublicClient, useWalletClient } from 'wagmi';

const LP_ABI = [
  "function name() view returns (string)",
  "function symbol() view returns (string)",
  "function balanceOf(address) view returns (uint256)",
  "function token0() view returns (address)",
  "function token1() view returns (address)",
  "function getReserves() view returns (uint112, uint112, uint32)",
  "function totalSupply() view returns (uint256)",
  "function approve(address spender, uint256 amount) public returns (bool)"
];

const ERC20_ABI = ["function symbol() view returns (string)"];
const ROUTER_ABI = [
  "function removeLiquidity(address tokenA, address tokenB, uint liquidity, uint amountAMin, uint amountBMin, address to, uint deadline) external returns (uint amountA, uint amountB)"
];

export const RemoveLiquidity = () => {
  // 1. Integrasi Hooks Wagmi 🔌
  const { address: account, isConnected } = useAccount();
  const publicClient = usePublicClient();
  const { data: walletClient } = useWalletClient();

  const [userLPs, setUserLPs] = useState<any[]>([]);
  const [selectedLP, setSelectedLP] = useState<any>(null);
  const [percent, setPercent] = useState(50);
  const [loading, setLoading] = useState(false);

  const ROUTER_ADDR = "0xc48891E4E525D4c32b0B06c5fe77Efe7743939FD";
  const EXPLORER_URL = "https://testnet-explorer.celeschain.xyz/tx/";

  const scanWalletLPs = useCallback(async () => {
    // Menggunakan publicClient untuk scan blockchain 🔍
    if (!account || !publicClient) return;
    
    try {
      const KNOWN_LP_ADDRESSES = [
        "0xA145Df9D7B600c4299Fa6d084d42Ada9Fc47563b",
        "0x1E6fD293f93310020614Ac36725804369D371dcB"
      ];

      const foundLPs = [];
      const provider = new ethers.providers.Web3Provider(window.ethereum as any);

      for (const addr of KNOWN_LP_ADDRESSES) {
        try {
          const contract = new ethers.Contract(addr, LP_ABI, provider);
          const balance = await contract.balanceOf(account);

          if (balance.gt(0)) {
            const [t0, t1, supply, reserves] = await Promise.all([
              contract.token0(), contract.token1(), contract.totalSupply(), contract.getReserves()
            ]);

            const s0Cont = new ethers.Contract(t0, ERC20_ABI, provider);
            const s1Cont = new ethers.Contract(t1, ERC20_ABI, provider);
            
            const [sym0, sym1] = await Promise.all([
              s0Cont.symbol().catch(() => "EX"),
              s1Cont.symbol().catch(() => "CLES")
            ]);

            foundLPs.push({
              address: addr,
              balance,
              t0, t1,
              sym0, sym1,
              supply,
              reserves,
              formattedBal: ethers.utils.formatEther(balance)
            });
          }
        } catch (e) {
          console.error("Pool not found at:", addr);
        }
      }

      setUserLPs(foundLPs);
      if (foundLPs.length > 0 && !selectedLP) {
        setSelectedLP(foundLPs[0]);
      }
    } catch (err) {
      console.error("Scan failed", err);
    }
  }, [account, publicClient, selectedLP]);

  useEffect(() => {
    if (isConnected) {
      scanWalletLPs();
      const timer = setInterval(scanWalletLPs, 15000);
      return () => clearInterval(timer);
    }
  }, [scanWalletLPs, isConnected]);

  const handleRemove = async () => {
    if (!selectedLP || !account || !walletClient) return;
    setLoading(true);
    const mainToast = toast.loading("Checking wallet status...");

    try {
      // Konversi WalletClient ke Ethers Signer ✍️
      const provider = new ethers.providers.Web3Provider(walletClient as any);
      const signer = provider.getSigner();
      
      const removeAmount = selectedLP.balance.mul(percent).div(100);
      const lpContract = new ethers.Contract(selectedLP.address, LP_ABI, signer);

      // STEP 1: APPROVE
      toast.loading("Step 1/2: Approving LP tokens...", { id: mainToast });
      const appTx = await lpContract.approve(ROUTER_ADDR, removeAmount);
      await appTx.wait();

      // STEP 2: REMOVE
      toast.loading("Step 2/2: Confirming in wallet...", { id: mainToast });
      const router = new ethers.Contract(ROUTER_ADDR, ROUTER_ABI, signer);
      const deadline = Math.floor(Date.now() / 1000) + 600;

      const tx = await router.removeLiquidity(
        selectedLP.t0, selectedLP.t1, removeAmount, 0, 0, account, deadline
      );

      toast.loading(
        (t) => (
          <div className="flex flex-col gap-1">
            <span>Transaction processing...</span>
            <a href={`${EXPLORER_URL}${tx.hash}`} target="_blank" rel="noreferrer" className="text-blue-400 underline text-[10px]">
              View Transaction Details
            </a>
          </div>
        ), 
        { id: mainToast }
      );

      const receipt = await tx.wait();
      
      if (receipt.status === 1) {
        toast.success("Liquidity successfully removed!", { id: mainToast, duration: 4000 });
        setTimeout(scanWalletLPs, 1000);
      } else {
        toast.error("Transaction failed on blockchain", { id: mainToast });
      }

    } catch (err: any) {
      toast.error(err.reason || "Action canceled", { id: mainToast });
    }
    setLoading(false);
  };

  return (
    <div className="space-y-4">
      <Toaster position="bottom-center" toastOptions={{
        style: { background: '#0f172a', color: '#fff', border: '1px solid #1e293b', borderRadius: '16px', fontSize: '13px' }
      }} />

      <h2 className="text-[10px] font-black text-slate-500 uppercase tracking-widest text-center">Your Liquidity Pairs</h2>
      
      <select 
        value={selectedLP?.address || ""}
        onChange={(e) => setSelectedLP(userLPs.find(l => l.address === e.target.value))}
        className="w-full bg-black/40 border border-slate-800 p-4 rounded-2xl text-xs font-black text-green-400 outline-none focus:ring-1 focus:ring-green-500"
      >
        {!isConnected ? (
          <option>Please Connect Wallet...</option>
        ) : userLPs.length === 0 ? (
          <option>Scanning Blockchain for LP Balance...</option>
        ) : (
          userLPs.map(lp => (
            <option key={lp.address} value={lp.address}>
              {lp.sym0} / {lp.sym1} ({parseFloat(lp.formattedBal).toFixed(4)} LP)
            </option>
          ))
        )}
      </select>

      {selectedLP && isConnected && (
        <div className="space-y-4 animate-in fade-in slide-in-from-bottom-2 duration-500">
          <div className="bg-black/40 p-6 rounded-3xl border border-slate-800 text-center relative overflow-hidden group">
            <div className="absolute top-0 left-0 w-full h-1 bg-slate-800">
               <div className="h-full bg-green-500 transition-all duration-300" style={{width: `${percent}%`}}></div>
            </div>
            <div className="text-5xl font-black text-white my-2">{percent}%</div>
            <input type="range" min="1" max="100" value={percent} onChange={(e) => setPercent(parseInt(e.target.value))} className="w-full accent-green-500 mt-4 cursor-pointer" />
          </div>

          <div className="grid grid-cols-2 gap-2 text-center">
            <div className="bg-slate-900/50 p-4 rounded-2xl border border-slate-800">
              <p className="text-[8px] font-bold text-slate-500 uppercase tracking-tighter">Receive {selectedLP.sym0}</p>
              <p className="text-lg font-black text-white truncate">
                {ethers.utils.formatEther(selectedLP.balance.mul(selectedLP.reserves[0]).div(selectedLP.supply).mul(percent).div(100))}
              </p>
            </div>
            <div className="bg-slate-900/50 p-4 rounded-2xl border border-slate-800">
              <p className="text-[8px] font-bold text-slate-500 uppercase tracking-tighter">Receive {selectedLP.sym1}</p>
              <p className="text-lg font-black text-white truncate">
                {ethers.utils.formatEther(selectedLP.balance.mul(selectedLP.reserves[1]).div(selectedLP.supply).mul(percent).div(100))}
              </p>
            </div>
          </div>

          <button 
            onClick={handleRemove}
            disabled={loading || !isConnected}
            className="w-full bg-red-600 hover:bg-red-500 disabled:bg-slate-800 text-white font-black py-5 rounded-[2rem] transition-all uppercase text-[11px] tracking-widest active:scale-95 shadow-xl shadow-red-900/20"
          >
            {loading ? 'EXECUTING...' : `CONFIRM WITHDRAWAL`}
          </button>
        </div>
      )}
    </div>
  );
};