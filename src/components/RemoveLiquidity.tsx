import React, { useState, useEffect, useCallback } from 'react';
import toast, { Toaster } from 'react-hot-toast';
import { 
  useAccount,
  usePublicClient,
  useWalletClient,
  useReadContract,
  useWriteContract
} from 'wagmi';
import { formatEther, parseEther } from 'viem';

const LP_ABI = [
  {
    name: 'balanceOf',
    type: 'function',
    stateMutability: 'view',
    inputs: [{ name: '', type: 'address' }],
    outputs: [{ name: '', type: 'uint256' }],
  },
  {
    name: 'token0',
    type: 'function',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ name: '', type: 'address' }],
  },
  {
    name: 'token1',
    type: 'function',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ name: '', type: 'address' }],
  },
  {
    name: 'getReserves',
    type: 'function',
    stateMutability: 'view',
    inputs: [],
    outputs: [
      { name: '_reserve0', type: 'uint112' },
      { name: '_reserve1', type: 'uint112' },
      { name: '_blockTimestampLast', type: 'uint32' }
    ],
  },
  {
    name: 'totalSupply',
    type: 'function',
    stateMutability: 'view',
    inputs: [],
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

const ERC20_ABI = [
  {
    name: 'symbol',
    type: 'function',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ name: '', type: 'string' }],
  }
] as const;

const ROUTER_ABI = [
  {
    name: 'removeLiquidity',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'tokenA', type: 'address' },
      { name: 'tokenB', type: 'address' },
      { name: 'liquidity', type: 'uint256' },
      { name: 'amountAMin', type: 'uint256' },
      { name: 'amountBMin', type: 'uint256' },
      { name: 'to', type: 'address' },
      { name: 'deadline', type: 'uint256' }
    ],
    outputs: [
      { name: 'amountA', type: 'uint256' },
      { name: 'amountB', type: 'uint256' }
    ],
  }
] as const;

export const RemoveLiquidity = () => {
  const { address: account, isConnected } = useAccount();
  const publicClient = usePublicClient();
  const { data: walletClient } = useWalletClient();

  const [userLPs, setUserLPs] = useState<any[]>([]);
  const [selectedLP, setSelectedLP] = useState<any>(null);
  const [percent, setPercent] = useState(50);
  const [loading, setLoading] = useState(false);

  const ROUTER_ADDR = "0xc48891E4E525D4c32b0B06c5fe77Efe7743939FD";
  const EXPLORER_URL = "https://testnet-explorer.celeschain.xyz/tx/";

  const KNOWN_LP_ADDRESSES = [
    "0xA145Df9D7B600c4299Fa6d084d42Ada9Fc47563b",
    "0x1E6fD293f93310020614Ac36725804369D371dcB"
  ];

  const scanWalletLPs = useCallback(async () => {
    if (!account || !publicClient || !isConnected) return;

    try {
      const foundLPs = [];

      for (const lpAddr of KNOWN_LP_ADDRESSES) {
        try {
          const lpAddress = lpAddr as `0x${string}`;

          // Cek saldo LP
          const lpBalance = await publicClient.readContract({
            address: lpAddress,
            abi: LP_ABI,
            functionName: 'balanceOf',
            args: [account],
          });

          if (lpBalance === 0n) continue;

          // Ambil data LP
          const [token0, token1, totalSupply, reserves] = await Promise.all([
            publicClient.readContract({
              address: lpAddress,
              abi: LP_ABI,
              functionName: 'token0',
            }),
            publicClient.readContract({
              address: lpAddress,
              abi: LP_ABI,
              functionName: 'token1',
            }),
            publicClient.readContract({
              address: lpAddress,
              abi: LP_ABI,
              functionName: 'totalSupply',
            }),
            publicClient.readContract({
              address: lpAddress,
              abi: LP_ABI,
              functionName: 'getReserves',
            }),
          ]);

          // Ambil symbol token
          const [sym0, sym1] = await Promise.all([
            publicClient.readContract({
              address: token0,
              abi: ERC20_ABI,
              functionName: 'symbol',
            }).catch(() => 'UNKNOWN'),
            publicClient.readContract({
              address: token1,
              abi: ERC20_ABI,
              functionName: 'symbol',
            }).catch(() => 'UNKNOWN'),
          ]);

          foundLPs.push({
            address: lpAddr,
            balance: lpBalance,
            t0: token0,
            t1: token1,
            sym0,
            sym1,
            supply: totalSupply,
            reserves,
            formattedBal: formatEther(lpBalance),
          });
        } catch (e) {
          console.error(`Failed to load LP at ${lpAddr}:`, e);
        }
      }

      setUserLPs(foundLPs);

      // Auto-select pertama jika belum ada yang dipilih
      if (foundLPs.length > 0 && !selectedLP) {
        setSelectedLP(foundLPs[0]);
      }
    } catch (err) {
      console.error("LP scan failed:", err);
    }
  }, [account, publicClient, isConnected, selectedLP]);

  useEffect(() => {
    if (isConnected) {
      scanWalletLPs();
      const timer = setInterval(scanWalletLPs, 15000);
      return () => clearInterval(timer);
    }
  }, [scanWalletLPs, isConnected]);

  const { writeContractAsync } = useWriteContract();

  const handleRemove = async () => {
    if (!selectedLP || !account || !isConnected || !publicClient) {
      return toast.error("Please connect your wallet");
    }

    setLoading(true);
    const tId = toast.loading("Preparing removal...");

    try {
      const lpAddress = selectedLP.address as `0x${string}`;
      const removeAmount = (selectedLP.balance * BigInt(percent)) / 100n;

      // STEP 1: APPROVE LP ke Router
      toast.loading("Step 1/2: Approving LP tokens...", { id: tId });

      const approveHash = await writeContractAsync({
        address: lpAddress,
        abi: LP_ABI,
        functionName: 'approve',
        args: [ROUTER_ADDR, removeAmount],
      });

      await publicClient.waitForTransactionReceipt({ hash: approveHash });

      // STEP 2: REMOVE LIQUIDITY
      toast.loading("Step 2/2: Confirming removal...", { id: tId });

      const deadline = BigInt(Math.floor(Date.now() / 1000) + 600);

      const txHash = await writeContractAsync({
        address: ROUTER_ADDR,
        abi: ROUTER_ABI,
        functionName: 'removeLiquidity',
        args: [
          selectedLP.t0,
          selectedLP.t1,
          removeAmount,
          0n, // amountAMin (minimal 0 untuk testnet, bisa diatur lebih ketat)
          0n, // amountBMin
          account,
          deadline,
        ],
      });

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
