import React, { useState, useEffect, useCallback } from 'react';
import { ethers } from 'ethers';
import toast, { Toaster } from 'react-hot-toast';
import { useAccount, usePublicClient, useWalletClient } from 'wagmi';

// 1. ABI DALAM FORMAT JSON (Mencegah error 'in operator')
const MASTERCHEF_ABI = [
  {
    name: 'deposit', type: 'function', stateMutability: 'nonpayable',
    inputs: [{ name: '_pid', type: 'uint256' }, { name: '_amount', type: 'uint256' }],
    outputs: []
  },
  {
    name: 'withdraw', type: 'function', stateMutability: 'nonpayable',
    inputs: [{ name: '_pid', type: 'uint256' }, { name: '_amount', type: 'uint256' }],
    outputs: []
  },
  {
    name: 'pendingEx', type: 'function', stateMutability: 'view',
    inputs: [{ name: '_pid', type: 'uint256' }, { name: '_user', type: 'address' }],
    outputs: [{ name: '', type: 'uint256' }]
  },
  {
    name: 'userInfo', type: 'function', stateMutability: 'view',
    inputs: [{ name: '_pid', type: 'uint256' }, { name: '_user', type: 'address' }],
    outputs: [{ name: 'amount', type: 'uint256' }, { name: 'rewardDebt', type: 'uint256' }]
  }
];

const ERC20_ABI = [
  {
    name: 'approve', type: 'function', stateMutability: 'nonpayable',
    inputs: [{ name: 'spender', type: 'address' }, { name: 'amount', type: 'uint256' }],
    outputs: [{ name: '', type: 'bool' }]
  },
  {
    name: 'balanceOf', type: 'function', stateMutability: 'view',
    inputs: [{ name: 'account', type: 'address' }],
    outputs: [{ name: '', type: 'uint256' }]
  },
  {
    name: 'allowance', type: 'function', stateMutability: 'view',
    inputs: [{ name: 'owner', type: 'address' }, { name: 'spender', type: 'address' }],
    outputs: [{ name: '', type: 'uint256' }]
  }
];

const Stake = () => {
  // ALAMAT DARI .ENV
  const MASTERCHEF_ADDR = "0x793738CD083fe56b655DAF38371B930a6c234609";
  const EX_TOKEN_ADDR = "0xB567431a2719a25E40F49B5a9E478E54C0944Afc";
  const PID = 0n;

  const { address: account, isConnected } = useAccount();
  const publicClient = usePublicClient();
  const { data: walletClient } = useWalletClient();

  const [amount, setAmount] = useState('');
  const [stakedBalance, setStakedBalance] = useState('0.0000');
  const [reward, setReward] = useState('0.0000');
  const [exBalance, setExBalance] = useState('0.0000');
  const [loading, setLoading] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);

  // FUNGSI UPDATE DATA
  const updateStats = useCallback(async () => {
    if (!account || !publicClient) return;
    
    setIsRefreshing(true);
    try {
      const [userInfo, pending, walletBalance] = await Promise.all([
        publicClient.readContract({
          address: MASTERCHEF_ADDR, abi: MASTERCHEF_ABI,
          functionName: 'userInfo', args: [PID, account],
        }),
        publicClient.readContract({
          address: MASTERCHEF_ADDR, abi: MASTERCHEF_ABI,
          functionName: 'pendingEx', args: [PID, account],
        }),
        publicClient.readContract({
          address: EX_TOKEN_ADDR, abi: ERC20_ABI,
          functionName: 'balanceOf', args: [account],
        }),
      ]);

      setStakedBalance(ethers.formatUnits(userInfo?.[0] || 0n, 18));
      setReward(ethers.formatUnits(pending || 0n, 18));
      setExBalance(ethers.formatUnits(walletBalance || 0n, 18));
    } catch (err) {
      console.error("Fetch Error:", err);
    } finally {
      setIsRefreshing(false);
    }
  }, [account, publicClient]);

  useEffect(() => {
    if (isConnected) {
      updateStats();
      const interval = setInterval(updateStats, 15000);
      return () => clearInterval(interval);
    }
  }, [isConnected, updateStats]);

  // FUNGSI STAKE / UNSTAKE
  const handleAction = async (isDeposit) => {
    if (!walletClient || !account) return toast.error("Connect wallet!");
    const inputVal = isDeposit ? amount : stakedBalance;
    
    if (!inputVal || parseFloat(inputVal) <= 0) return toast.error("Invalid amount!");

    setLoading(true);
    const tId = "action-toast";
    toast.loading(isDeposit ? "Staking..." : "Unstaking...", { id: tId });

    try {
      const parsedAmount = ethers.parseUnits(inputVal, 18);

      // APPROVAL
      if (isDeposit) {
        const allowance = await publicClient.readContract({
          address: EX_TOKEN_ADDR, abi: ERC20_ABI,
          functionName: 'allowance', args: [account, MASTERCHEF_ADDR],
        });

        if (BigInt(allowance) < parsedAmount) {
          toast.loading("Approving...", { id: tId });
          const { request } = await publicClient.simulateContract({
            account, address: EX_TOKEN_ADDR, abi: ERC20_ABI,
            functionName: 'approve', args: [MASTERCHEF_ADDR, ethers.MaxUint256],
          });
          const hash = await walletClient.writeContract(request);
          await publicClient.waitForTransactionReceipt({ hash });
        }
      }

      // EXECUTE
      const { request } = await publicClient.simulateContract({
        account, address: MASTERCHEF_ADDR, abi: MASTERCHEF_ABI,
        functionName: isDeposit ? 'deposit' : 'withdraw', args: [PID, parsedAmount],
      });
      const txHash = await walletClient.writeContract(request);
      await publicClient.waitForTransactionReceipt({ hash: txHash });

      toast.success("Success!", { id: tId });
      setAmount('');
      updateStats();
    } catch (err) {
      toast.error(err.shortMessage || "Failed", { id: tId });
    } finally {
      setLoading(false);
    }
  };

  const handleHarvest = async () => {
    if (!walletClient || !account) return;
    const tId = toast.loading("Harvesting...");
    try {
      const { request } = await publicClient.simulateContract({
        account, address: MASTERCHEF_ADDR, abi: MASTERCHEF_ABI,
        functionName: 'deposit', args: [PID, 0n],
      });
      const hash = await walletClient.writeContract(request);
      await publicClient.waitForTransactionReceipt({ hash });
      toast.success("Harvested!", { id: tId });
      updateStats();
    } catch (err) {
      toast.error("Failed", { id: tId });
    }
  };

  return (
    <div className="max-w-md mx-auto p-4 space-y-6 text-white font-sans">
      <Toaster position="bottom-center" />
      
      <div className="flex justify-between items-center">
        <h2 className="font-black text-xs uppercase tracking-tighter text-cyan-500">Master Staking V2</h2>
        <button onClick={updateStats} className="text-[10px] bg-white/5 px-3 py-1 rounded-full border border-white/10">
          {isRefreshing ? 'Syncing...' : '↻ Refresh'}
        </button>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="bg-[#111] p-4 rounded-2xl border border-white/5">
          <p className="text-[9px] text-slate-500 uppercase font-bold">Staked</p>
          <p className="text-xl font-black">{Number(stakedBalance).toFixed(2)}</p>
        </div>
        <div className="bg-[#111] p-4 rounded-2xl border border-white/5">
          <p className="text-[9px] text-cyan-500 uppercase font-bold">Earned</p>
          <p className="text-xl font-black text-cyan-400">{Number(reward).toFixed(4)}</p>
        </div>
      </div>

      <div className="bg-[#111] p-6 rounded-[2rem] border border-white/10">
        <div className="flex justify-between text-[10px] mb-4 text-slate-400 font-bold">
          <span>STAKE EX</span>
          <span className="text-cyan-500 cursor-pointer" onClick={() => setAmount(exBalance)}>Wallet: {Number(exBalance).toFixed(4)}</span>
        </div>
        <input 
          type="number" placeholder="0.0" value={amount}
          onChange={(e) => setAmount(e.target.value)}
          className="w-full bg-transparent text-4xl font-black outline-none mb-6 placeholder-white/5"
        />
        <div className="flex gap-2">
          <button onClick={() => handleAction(true)} disabled={loading || parseFloat(exBalance) <= 0}
            className="flex-[2] bg-cyan-500 text-black font-black py-4 rounded-xl text-xs uppercase hover:bg-cyan-400 disabled:bg-slate-800 transition-all">
            {loading ? 'Wait...' : 'Stake'}
          </button>
          <button onClick={() => handleAction(false)} disabled={loading || parseFloat(stakedBalance) <= 0}
            className="flex-1 bg-white/5 font-black py-4 rounded-xl text-xs uppercase border border-white/10">
            Unstake
          </button>
        </div>
      </div>

      <button onClick={handleHarvest} disabled={parseFloat(reward) <= 0}
        className="w-full py-4 text-[10px] font-black border border-cyan-500/20 rounded-xl uppercase text-cyan-500 hover:bg-cyan-500/5">
        Harvest Rewards
      </button>

      <div className="text-center text-[8px] text-slate-600 font-bold tracking-widest uppercase">
        Network: Celes Testnet V2 | Chain: 22225
      </div>
    </div>
  );
};

export default Stake;