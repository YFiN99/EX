import React, { useState, useEffect } from 'react';
import toast from 'react-hot-toast';
import { 
  useAccount,
  useBalance,
  usePublicClient,
  useWalletClient,
  useReadContract,
  useWriteContract,
  useWaitForTransactionReceipt
} from 'wagmi';
import { parseEther, formatEther, formatUnits } from 'viem';

const MASTERCHEF_ABI = [
  {
    name: 'userInfo',
    type: 'function',
    stateMutability: 'view',
    inputs: [
      { name: '_pid', type: 'uint256' },
      { name: '_user', type: 'address' }
    ],
    outputs: [
      { name: 'amount', type: 'uint256' },
      { name: 'rewardDebt', type: 'uint256' }
    ],
  },
  {
    name: 'pendingEx',
    type: 'function',
    stateMutability: 'view',
    inputs: [
      { name: '_pid', type: 'uint256' },
      { name: '_user', type: 'address' }
    ],
    outputs: [{ name: '', type: 'uint256' }],
  },
  {
    name: 'deposit',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [
      { name: '_pid', type: 'uint256' },
      { name: '_amount', type: 'uint256' }
    ],
    outputs: [],
  },
  {
    name: 'withdraw',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [
      { name: '_pid', type: 'uint256' },
      { name: '_amount', type: 'uint256' }
    ],
    outputs: [],
  }
] as const;

const ERC20_ABI = [
  {
    name: 'balanceOf',
    type: 'function',
    stateMutability: 'view',
    inputs: [{ name: 'account', type: 'address' }],
    outputs: [{ name: '', type: 'uint256' }],
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

export const Stake = () => {
  const { address: account, isConnected } = useAccount();
  const publicClient = usePublicClient();
  const { data: walletClient } = useWalletClient();

  const [amount, setAmount] = useState('');
  const [loading, setLoading] = useState(false);

  const MASTERCHEF_ADDR = "0x793738CD083fe56b655DAF38371B930a6c234609";
  const EX_TOKEN_ADDR = "0xB567431a2719a25E40F49B5a9E478E54C0944Afc";
  const PID = 0n;

  // ── Saldo EX di wallet ────────────────────────────────────────
  const { data: exWalletBalanceRaw } = useReadContract({
    address: EX_TOKEN_ADDR,
    abi: ERC20_ABI,
    functionName: 'balanceOf',
    args: [account!],
    enabled: !!account && isConnected,
  });

  const exBalance = exWalletBalanceRaw 
    ? formatEther(exWalletBalanceRaw) 
    : '0.0000';

  // ── Data staking dari MasterChef ───────────────────────────────
  const { data: userInfoRaw } = useReadContract({
    address: MASTERCHEF_ADDR,
    abi: MASTERCHEF_ABI,
    functionName: 'userInfo',
    args: [PID, account!],
    enabled: !!account && isConnected,
  });

  const { data: pendingRewardRaw } = useReadContract({
    address: MASTERCHEF_ADDR,
    abi: MASTERCHEF_ABI,
    functionName: 'pendingEx',
    args: [PID, account!],
    enabled: !!account && isConnected,
  });

  const stakedBalance = userInfoRaw ? formatEther(userInfoRaw[0]) : '0.0000';
  const reward = pendingRewardRaw ? formatEther(pendingRewardRaw) : '0.0000';

  // Auto-refresh stats setiap 10 detik
  useEffect(() => {
    if (!isConnected) return;

    const interval = setInterval(() => {
      // Wagmi akan otomatis refetch karena query enabled
    }, 10000);

    return () => clearInterval(interval);
  }, [isConnected]);

  const { writeContractAsync } = useWriteContract();

  const handleAction = async (isDeposit: boolean) => {
    if (!isConnected || !account || !publicClient) {
      return toast.error("Please connect your wallet");
    }

    if (isDeposit && (!amount || parseFloat(amount) <= 0)) {
      return toast.error("Please enter a valid amount");
    }

    setLoading(true);
    const tId = toast.loading(isDeposit ? "Staking EX..." : "Unstaking EX...");

    try {
      const amountWei = parseEther(isDeposit ? amount : stakedBalance);

      if (isDeposit) {
        // Cek allowance
        const allowance = await publicClient.readContract({
          address: EX_TOKEN_ADDR,
          abi: ERC20_ABI,
          functionName: 'allowance',
          args: [account, MASTERCHEF_ADDR],
        });

        if (allowance < amountWei) {
          toast.loading("Approving EX token...", { id: tId });
          const approveHash = await writeContractAsync({
            address: EX_TOKEN_ADDR,
            abi: ERC20_ABI,
            functionName: 'approve',
            args: [MASTERCHEF_ADDR, 2n ** 256n - 1n], // Max uint256
          });
          await publicClient.waitForTransactionReceipt({ hash: approveHash });
        }

        toast.loading("Confirming stake...", { id: tId });
        const depositHash = await writeContractAsync({
          address: MASTERCHEF_ADDR,
          abi: MASTERCHEF_ABI,
          functionName: 'deposit',
          args: [PID, amountWei],
        });

        await publicClient.waitForTransactionReceipt({ hash: depositHash });
      } else {
        toast.loading("Confirming unstake...", { id: tId });
        const withdrawHash = await writeContractAsync({
          address: MASTERCHEF_ADDR,
          abi: MASTERCHEF_ABI,
          functionName: 'withdraw',
          args: [PID, amountWei],
        });

        await publicClient.waitForTransactionReceipt({ hash: withdrawHash });
      }

      toast.success(isDeposit ? "Staked successfully!" : "Unstaked successfully!", { id: tId });
      setAmount('');
    } catch (err: any) {
      toast.error(err.shortMessage || "Transaction failed", { id: tId });
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleHarvest = async () => {
    if (!isConnected || !account) {
      return toast.error("Please connect your wallet");
    }

    if (parseFloat(reward) <= 0) {
      return toast.error("No rewards to harvest");
    }

    const tId = toast.loading("Harvesting rewards...");

    try {
      // Deposit 0 untuk harvest (pola umum MasterChef)
      const harvestHash = await writeContractAsync({
        address: MASTERCHEF_ADDR,
        abi: MASTERCHEF_ABI,
        functionName: 'deposit',
        args: [PID, 0n],
      });

      await publicClient.waitForTransactionReceipt({ hash: harvestHash });
      toast.success("Rewards harvested!", { id: tId });
    } catch (err: any) {
      toast.error(err.shortMessage || "Harvest failed", { id: tId });
      console.error(err);
    }
  };

  return (
    <div className="space-y-6">
      {/* Stat Cards */}
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

      {/* Input & Action */}
      <div className="bg-black/40 p-5 rounded-[2.5rem] border border-white/5 shadow-inner">
        <div className="flex justify-between text-[11px] font-bold mb-3 px-2">
          <span className="text-slate-500">Amount to Stake</span>
          <span 
            className="text-cyan-500/60 cursor-pointer hover:text-cyan-400"
            onClick={() => setAmount(exBalance)}
          >
            Wallet: {parseFloat(exBalance).toFixed(4)}
          </span>
        </div>
        <input
          type="number"
          placeholder="0.0"
          value={amount}
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
