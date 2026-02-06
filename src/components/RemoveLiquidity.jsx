import React, { useState, useEffect, useCallback } from 'react';
import { ethers } from 'ethers';
import toast, { Toaster } from 'react-hot-toast';
import { useAccount, usePublicClient, useWalletClient } from 'wagmi';
import { parseAbi, getAddress } from 'viem';

const LP_ABI = parseAbi([
  "function name() view returns (string)",
  "function symbol() view returns (string)",
  "function balanceOf(address account) view returns (uint256)",
  "function token0() view returns (address)",
  "function token1() view returns (address)",
  "function approve(address spender, uint256 amount) public returns (bool)",
]);

const ERC20_ABI = parseAbi(["function symbol() view returns (string)"]);
const ROUTER_ABI = parseAbi([
  "function removeLiquidity(address tokenA, address tokenB, uint liquidity, uint amountAMin, uint amountBMin, address to, uint deadline) external returns (uint amountA, uint amountB)",
]);

const RemoveLiquidity = ({ routerAddr }) => {
  const { address: account, isConnected } = useAccount();
  const publicClient = usePublicClient();
  const { data: walletClient } = useWalletClient();

  const [userLPs, setUserLPs] = useState([]);
  const [selectedLP, setSelectedLP] = useState(null);
  const [percent, setPercent] = useState(50);
  const [loading, setLoading] = useState(false);
  const [isScanning, setIsScanning] = useState(false);

  const FINAL_ROUTER_ADDR = routerAddr || "0xAlamatRouterKamuDiSini";
  const safeAddr = (addr) => getAddress(addr);

  // Pastikan alamat ini benar-benar Pair Contract hasil Factory
  const KNOWN_LP_ADDRESSES = [
    "0xA145Df9D7B600c4299Fa6d084d42Ada9Fc47563b",
    "0x1E6fD293f93310020614Ac36725804369D371dcB",
  ];

  const scanWalletLPs = useCallback(async () => {
    if (!account || !publicClient) return;
    setIsScanning(true);
    
    try {
      const foundLPs = [];
      
      // Menggunakan loop dengan try-catch internal agar tidak berhenti jika 1 contract error
      for (const lpAddr of KNOWN_LP_ADDRESSES) {
        try {
          const balance = await publicClient.readContract({
            address: safeAddr(lpAddr),
            abi: LP_ABI,
            functionName: 'balanceOf',
            args: [account],
          });

          if (balance > 0n) {
            const [token0, token1] = await Promise.all([
              publicClient.readContract({ address: safeAddr(lpAddr), abi: LP_ABI, functionName: 'token0' }),
              publicClient.readContract({ address: safeAddr(lpAddr), abi: LP_ABI, functionName: 'token1' }),
            ]);

            const [sym0, sym1] = await Promise.all([
              publicClient.readContract({ address: safeAddr(token0), abi: ERC20_ABI, functionName: 'symbol' }).catch(() => "T0"),
              publicClient.readContract({ address: safeAddr(token1), abi: ERC20_ABI, functionName: 'symbol' }).catch(() => "T1"),
            ]);

            foundLPs.push({
              address: lpAddr,
              balance,
              t0: token0,
              t1: token1,
              sym0,
              sym1,
              formattedBal: ethers.formatUnits(balance, 18),
            });
          }
        } catch (e) {
          console.warn(`Skipping LP ${lpAddr}: Contract not found or RPC error`);
        }
      }

      setUserLPs(foundLPs);
      // Set default selection jika belum ada yang dipilih
      if (foundLPs.length > 0 && (!selectedLP || !foundLPs.find(l => l.address === selectedLP.address))) {
        setSelectedLP(foundLPs[0]);
      }
    } catch (err) {
      console.error("General Scan Error:", err);
    } finally {
      setIsScanning(false);
    }
  }, [account, publicClient, selectedLP]);

  useEffect(() => {
    if (isConnected) scanWalletLPs();
  }, [isConnected, account, scanWalletLPs]);

  const handleRemove = async () => {
    if (!selectedLP || !walletClient || !account || !FINAL_ROUTER_ADDR) return;

    setLoading(true);
    const tId = "remove-liq-toast";
    toast.loading("Step 1/2: Approving LP...", { id: tId });

    try {
      const liqToRemove = (selectedLP.balance * BigInt(percent)) / 100n;
      const deadline = BigInt(Math.floor(Date.now() / 1000) + 600);
      const rAddr = safeAddr(FINAL_ROUTER_ADDR);

      // 1. APPROVE
      const { hash: appHash } = await walletClient.writeContract({
        address: safeAddr(selectedLP.address),
        abi: LP_ABI,
        functionName: 'approve',
        args: [rAddr, liqToRemove],
      });

      // Bypass jika receipt lama
      await publicClient.waitForTransactionReceipt({ hash: appHash, timeout: 15_000 }).catch(() => null);

      // 2. REMOVE
      toast.loading("Step 2/2: Confirm Removal...", { id: tId });
      const { hash: remHash } = await walletClient.writeContract({
        address: rAddr,
        abi: ROUTER_ABI,
        functionName: 'removeLiquidity',
        args: [
          safeAddr(selectedLP.t0),
          safeAddr(selectedLP.t1),
          liqToRemove,
          0n,
          0n,
          account,
          deadline,
        ],
      });

      // OPTIMISTIC RESET
      toast.success("Transaction Sent! Refreshing...", { id: tId });
      setLoading(false);
      setPercent(50);

      // Polling Refresh
      let count = 0;
      const interval = setInterval(() => {
        scanWalletLPs();
        count++;
        if (count >= 5) clearInterval(interval);
      }, 3000);

    } catch (err) {
      toast.error(err.shortMessage || "Transaction failed", { id: tId });
      setLoading(false);
    }
  };

  return (
    <div className="space-y-4">
      <Toaster position="bottom-center" />
      <div className="flex justify-between items-center px-2">
        <h2 className="text-xl font-black text-white uppercase tracking-tighter">Remove Liquidity</h2>
        <button 
          onClick={scanWalletLPs} 
          disabled={isScanning}
          className="text-[10px] bg-slate-800 text-slate-400 px-3 py-1 rounded-md hover:text-green-400 transition-colors"
        >
          {isScanning ? 'SCANNING...' : 'REFRESH'}
        </button>
      </div>

      {userLPs.length === 0 ? (
        <div className="bg-black/40 p-10 rounded-[2.5rem] border border-slate-800 text-center">
          <p className="text-slate-500 text-sm font-bold">
            {isScanning ? "Checking positions..." : "No active LP positions found."}
          </p>
          {!isScanning && (
            <button onClick={scanWalletLPs} className="mt-4 text-green-500 text-[10px] font-bold underline">TRY AGAIN</button>
          )}
        </div>
      ) : (
        <>
          {/* Pool Selector */}
          <div className="bg-black/40 p-5 rounded-[2.5rem] border border-slate-800">
            <label className="text-[10px] font-bold text-slate-400 uppercase mb-3 block px-2">Select Pool</label>
            <select 
              className="w-full bg-slate-900 text-green-400 p-4 rounded-2xl border border-slate-700 outline-none font-bold"
              onChange={(e) => setSelectedLP(userLPs.find(l => l.address === e.target.value))}
              value={selectedLP?.address}
            >
              {userLPs.map(lp => (
                <option key={lp.address} value={lp.address}>
                  {lp.sym0}/{lp.sym1} — Bal: {parseFloat(lp.formattedBal).toFixed(6)}
                </option>
              ))}
            </select>
          </div>

          {/* Slider */}
          <div className="bg-black/40 p-5 rounded-[2.5rem] border border-slate-800">
            <div className="flex justify-between text-[10px] font-bold text-slate-400 uppercase mb-4 px-2">
              <span>Amount to Remove</span>
              <span className="text-green-500 text-lg">{percent}%</span>
            </div>
            <input 
              type="range" min="1" max="100" value={percent} 
              onChange={(e) => setPercent(parseInt(e.target.value))}
              className="w-full h-2 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-green-500"
            />
          </div>

          <button
            onClick={handleRemove}
            disabled={loading || !isConnected || !selectedLP}
            className="w-full bg-red-500 hover:bg-red-400 disabled:bg-slate-800 disabled:text-slate-600 text-black font-black py-5 rounded-[2.5rem] transition-all text-[12px] uppercase mt-2"
          >
            {loading ? 'Processing...' : 'Confirm Remove Liquidity'}
          </button>
        </>
      )}
    </div>
  );
};

export default RemoveLiquidity;