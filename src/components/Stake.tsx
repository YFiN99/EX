import React, { useState, useEffect } from 'react';
import { ethers } from 'ethers';
import toast from 'react-hot-toast';
import { useAccount, usePublicClient, useWalletClient } from 'wagmi';

const MASTERCHEF_ABI = [
  "function deposit(uint256 _pid, uint256 _amount) public",
  "function withdraw(uint256 _pid, uint256 _amount) public",
  "function pendingEx(uint256 _pid, address _user) public view returns (uint256)",
  "function userInfo(uint256 _pid, address _user) public view returns (uint256 amount, uint256 rewardDebt)"
];

const ERC20_ABI = [
  "function approve(address spender, uint256 amount) public returns (bool)", 
  "function balanceOf(address account) public view returns (uint256)",
  "function allowance(address owner, address spender) public view returns (uint256)"
];

export const Stake = () => {
  // 1. Integrasi Hooks Wagmi 🔌
  const { address: account, isConnected } = useAccount();
  const publicClient = usePublicClient();
  const { data: walletClient } = useWalletClient();

  const [amount, setAmount] = useState('');
  const [stakedBalance, setStakedBalance] = useState('0.0000');
  const [reward, setReward] = useState('0.0000');
  const [exBalance, setExBalance] = useState('0.0000');
  const [loading, setLoading] = useState(false);

  const MASTERCHEF_ADDR = "0x793738CD083fe56b655DAF38371B930a6c234609";
  const EX_TOKEN_ADDR = "0xB567431a2719a25E40F49B5a9E478E54C0944Afc"; 
  const PID = 0; 

  const updateStats = async () => {
    // Menggunakan publicClient untuk pembacaan data yang lebih stabil
    if (!account || !publicClient) return;
    try {
      const provider = new ethers.providers.Web3Provider(window.ethereum as any);
      const chef = new ethers.Contract(MASTERCHEF_ADDR, MASTERCHEF_ABI, provider);
      const exToken = new ethers.Contract(EX_TOKEN_ADDR, ERC20_ABI, provider);
      
      const [uInfo, pending, walletEx] = await Promise.all([
        chef.userInfo(PID, account),
        chef.pendingEx(PID, account),
        exToken.balanceOf(account)
      ]);

      setStakedBalance(ethers.utils.formatEther(uInfo.amount));
      setReward(ethers.utils.formatEther(pending));
      setExBalance(ethers.utils.formatEther(walletEx));
    } catch (err) {
      console.error("Stats Error:", err);
    }
  };

  useEffect(() => {
    if (isConnected) {
      updateStats();
      const timer = setInterval(updateStats, 10000);
      return () => clearInterval(timer);
    }
  }, [account, isConnected]);

  const handleAction = async (isDeposit: boolean) => {
    if (!walletClient || !account) return toast.error("Connect your wallet");
    if (isDeposit && (!amount || parseFloat(amount) <= 0)) return toast.error("Enter amount");
    
    setLoading(true);
    const tId = toast.loading(isDeposit ? "Staking EX..." : "Unstaking EX...");
    
    try {
      // Konversi WalletClient (Wagmi) ke Ethers Signer ✍️
      const provider = new ethers.providers.Web3Provider(walletClient as any);
      const signer = provider.getSigner();
      
      const chef = new ethers.Contract(MASTERCHEF_ADDR, MASTERCHEF_ABI, signer);
      const exToken = new ethers.Contract(EX_TOKEN_ADDR, ERC20_ABI, signer);

      if (isDeposit) {
        const parsedAmount = ethers.utils.parseEther(amount);
        const allowance = await exToken.allowance(account, MASTERCHEF_ADDR);
        
        if (allowance.lt(parsedAmount)) {
          toast.loading("Approving EX...", { id: tId });
          const appTx = await exToken.approve(MASTERCHEF_ADDR, ethers.constants.MaxUint256);
          await appTx.wait();
        }
        
        toast.loading("Confirming Stake...", { id: tId });
        await (await chef.deposit(PID, parsedAmount)).wait();
        toast.success("Staked Successfully!", { id: tId });
      } else {
        toast.loading("Confirming Unstake...", { id: tId });
        await (await chef.withdraw(PID, ethers.utils.parseEther(stakedBalance))).wait();
        toast.success("Withdrawal Success!", { id: tId });
      }
      
      setAmount('');
      updateStats();
    } catch (err) {
      toast.error("Transaction Failed", { id: tId });
    }
    setLoading(false);
  };

  const handleHarvest = async () => {
    if (!walletClient) return toast.error("Connect wallet");
    if (parseFloat(reward) <= 0) return toast.error("No rewards to claim");
    
    const tId = toast.loading("Harvesting EX...");
    try {
      const provider = new ethers.providers.Web3Provider(walletClient as any);
      const signer = provider.getSigner();
      const chef = new ethers.Contract(MASTERCHEF_ADDR, MASTERCHEF_ABI, signer);
      
      // Deposit 0 sering digunakan di MasterChef untuk memicu harvest 🌾
      await (await chef.deposit(PID, 0)).wait();
      toast.success("Harvest Successful!", { id: tId });
      updateStats();
    } catch (err) {
      toast.error("Harvest Failed", { id: tId });
    }
  };

  return (
    <div className="space-y-6">
      {/* UI Stat tetap sama seperti desain cantik Anda */}
      <div className="grid grid-cols-2 gap-4">
        <div className="bg-white/5 p-5 rounded-[2rem] border border-white/5 backdrop-blur-md">
          <p className="text-[10px] text-slate-500 font-black uppercase tracking-widest mb-2">My Staked EX</p>
          <div className="flex items-baseline gap-1">
            <span className="text-xl font-black text-white">{parseFloat(stakedBalance).toFixed(2)}</span>
            <span className="text-[9px] font-bold text-slate-600">EX</span>
          </div>
        </div>

        <div className="bg-cyan-500/5 p-5 rounded-[2rem] border border-cyan-500/10 backdrop-blur-md relative overflow-hidden">
          <div className="absolute top-3 right-3 w-1.5 h-1.5 bg-cyan-400 rounded-full animate-pulse"></div>
          <p className="text-[10px] text-cyan-500/70 font-black uppercase tracking-widest mb-2">Yield Earned</p>
          <div className="flex items-baseline gap-1">
            <span className="text-xl font-black text-cyan-400">{parseFloat(reward).toFixed(4)}</span>
            <span className="text-[9px] font-bold text-cyan-700">EX</span>
          </div>
        </div>
      </div>

      {/* Input Area */}
      <div className="bg-black/40 p-5 rounded-[2.5rem] border border-white/5 shadow-inner">
        <div className="flex justify-between text-[11px] font-bold mb-3 px-2">
          <span className="text-slate-500">Amount to Stake</span>
          <span className="text-cyan-500/60 cursor-pointer hover:text-cyan-400" onClick={() => setAmount(exBalance)}>
            Wallet: {parseFloat(exBalance).toFixed(4)}
          </span>
        </div>
        <input 
          type="number" placeholder="0.0" value={amount}
          onChange={(e) => setAmount(e.target.value)}
          className="w-full bg-transparent text-2xl font-black outline-none mb-6 text-white placeholder:text-slate-800"
        />
        
        <div className="flex gap-3">
          <button 
            onClick={() => handleAction(true)}
            disabled={loading || !amount || !isConnected}
            className="flex-[2] bg-cyan-500 hover:bg-cyan-400 disabled:bg-slate-900 disabled:text-slate-700 text-black font-black py-5 rounded-[2rem] transition-all shadow-lg shadow-cyan-500/20 active:scale-95 text-[11px] tracking-[0.2em] uppercase"
          >
            {!isConnected ? "Connect First" : loading ? "Processing..." : "Stake EX"}
          </button>
          <button 
            onClick={() => handleAction(false)}
            disabled={loading || parseFloat(stakedBalance) <= 0 || !isConnected}
            className="flex-1 bg-white/5 hover:bg-white/10 text-white font-black py-5 rounded-[2rem] border border-white/10 text-[9px] tracking-[0.1em] uppercase transition-all"
          >
            Unstake
          </button>
        </div>
      </div>

      <button 
        onClick={handleHarvest}
        disabled={loading || parseFloat(reward) <= 0 || !isConnected}
        className="w-full py-4 text-[10px] font-black tracking-[0.3em] text-cyan-500 border border-cyan-500/20 rounded-[2rem] hover:bg-cyan-500/5 transition-all uppercase"
      >
        Harvest Rewards
      </button>

      <div className="flex justify-between items-center px-4 text-[9px] font-bold text-slate-700 uppercase tracking-widest">
          <span>Single Stake v2.5</span>
          <span>No Lock Period</span>
      </div>
    </div>
  );
};