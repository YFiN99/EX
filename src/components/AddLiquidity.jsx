import React, { useState } from 'react';
import toast, { Toaster } from 'react-hot-toast';
import { useAccount, usePublicClient, useWalletClient, useBalance } from 'wagmi';
import { parseAbi, getAddress, parseUnits } from 'viem';

const TOKEN_LIST = [
  { "symbol": "WCLES", "name": "Wrapped Celes", "address": "0xcfc4Fa68042509a239fA33f7A559860C875dCA70", "decimals": 18 },
  { "symbol": "WBTC", "name": "Wrapped BTC", "address": "0x97f4Fb442b5FDeD4Ce1f80f4777e904446db56F0", "decimals": 18 },
  { "symbol": "C.USDC", "name": "Celes USDC", "address": "0x1BAb49aA82197ee8B5131A09CfE2fE0BF1603103", "decimals": 6 },
  { "symbol": "EX", "name": "Exchange Token", "address": "0xB567431a2719a25E40F49B5a9E478E54C0944Afc", "decimals": 18 }
];

const ROUTER_ABI = parseAbi([
  "function addLiquidity(address tokenA, address tokenB, uint amountADesired, uint amountBDesired, uint amountAMin, uint amountBMin, address to, uint deadline) external returns (uint amountA, uint amountB, uint liquidity)",
]);

const ERC20_ABI = parseAbi([
  "function approve(address spender, uint256 amount) public returns (bool)",
  "function allowance(address owner, address spender) view returns (uint256)",
]);

const AddLiquidity = ({ routerAddr }) => {
  const { address: account, isConnected } = useAccount();
  const publicClient = usePublicClient();
  const { data: walletClient } = useWalletClient();

  const [tokenA, setTokenA] = useState(TOKEN_LIST[0]);
  const [tokenB, setTokenB] = useState(TOKEN_LIST[1]);
  const [amountA, setAmountA] = useState("");
  const [amountB, setAmountB] = useState("");
  const [loading, setLoading] = useState(false);

  const FINAL_ROUTER = getAddress(routerAddr || "0x675402035F9F7E0A2416f733698889370726B1E3");

  // HOOK SALDO DENGAN REFETCH
  const { data: balA, refetch: refetchA } = useBalance({ 
    address: account, 
    token: getAddress(tokenA.address), 
    query: { enabled: !!account } 
  });
  const { data: balB, refetch: refetchB } = useBalance({ 
    address: account, 
    token: getAddress(tokenB.address), 
    query: { enabled: !!account } 
  });

  // FUNGSI APPROVE
  const checkAndApprove = async (token, amount) => {
    const allowance = await publicClient.readContract({
      address: getAddress(token.address),
      abi: ERC20_ABI,
      functionName: 'allowance',
      args: [account, FINAL_ROUTER],
    });

    if (allowance < amount) {
      toast.loading(`Step: Approving ${token.symbol}...`, { id: "step" });
      const hash = await walletClient.writeContract({
        address: getAddress(token.address),
        abi: ERC20_ABI,
        functionName: 'approve',
        args: [FINAL_ROUTER, amount],
      });
      await publicClient.waitForTransactionReceipt({ hash });
    }
  };

  // FUNGSI UTAMA
  const handleAdd = async () => {
    if (!isConnected || !walletClient || !amountA || !amountB) {
      toast.error("Masukan jumlah token!");
      return;
    }

    setLoading(true);
    try {
      const valA = parseUnits(amountA, tokenA.decimals);
      const valB = parseUnits(amountB, tokenB.decimals);
      const deadline = BigInt(Math.floor(Date.now() / 1000) + 600);

      // Step 1: Approve Token A & B
      await checkAndApprove(tokenA, valA);
      await checkAndApprove(tokenB, valB);

      toast.loading("Adding Liquidity...", { id: "step" });

      const { request } = await publicClient.simulateContract({
        account,
        address: FINAL_ROUTER,
        abi: ROUTER_ABI,
        functionName: 'addLiquidity',
        args: [getAddress(tokenA.address), getAddress(tokenB.address), valA, valB, 0n, 0n, account, deadline],
      });

      const txHash = await walletClient.writeContract(request);
      
      toast.loading("Confirming transaction...", { id: "step" });
      await publicClient.waitForTransactionReceipt({ hash: txHash });

      // Refresh Saldo Manual agar tidak stuk
      toast.loading("Updating balances...", { id: "step" });
      await new Promise(resolve => setTimeout(resolve, 2000)); // Jeda 2 detik untuk RPC sync
      await Promise.all([refetchA(), refetchB()]);

      toast.success("Liquidity Berhasil Ditambahkan!", { id: "step" });
      setAmountA("");
      setAmountB("");
    } catch (err) {
      console.error(err);
      toast.error(err.shortMessage || "Gagal menambah liquidity", { id: "step" });
    } finally {
      setLoading(false);
      setTimeout(() => toast.dismiss("step"), 3000);
    }
  };

  return (
    <div className="max-w-md mx-auto space-y-4 p-5 bg-[#0d1117] rounded-[2rem] border border-white/10 shadow-2xl">
      <Toaster position="bottom-center" />
      
      <h2 className="text-white font-black text-center mb-4 text-sm uppercase tracking-widest">Add Liquidity</h2>

      {/* Box Token A */}
      <div className="bg-black/50 p-4 rounded-3xl border border-white/5">
        <div className="flex justify-between items-center mb-2">
          <select 
            className="bg-slate-900 text-white font-bold rounded-xl px-2 py-1 outline-none text-xs border border-white/10"
            value={tokenA.address}
            onChange={(e) => setTokenA(TOKEN_LIST.find(t => t.address === e.target.value))}
          >
            {TOKEN_LIST.map(t => <option key={t.address} value={t.address}>{t.symbol}</option>)}
          </select>
          <div className="text-right">
            <p className="text-[10px] text-slate-500 font-bold uppercase">Balance</p>
            <p className="text-xs text-cyan-400 font-mono">{balA ? Number(balA.formatted).toFixed(4) : "0.00"}</p>
          </div>
        </div>
        <div className="flex items-center">
          <input type="number" value={amountA} onChange={(e) => setAmountA(e.target.value)} placeholder="0.0" className="w-full bg-transparent text-white text-2xl font-black outline-none" />
          <button onClick={() => setAmountA(balA?.formatted || "0")} className="text-[10px] bg-cyan-500/20 text-cyan-400 px-2 py-1 rounded-lg font-bold hover:bg-cyan-500 hover:text-black transition-all">MAX</button>
        </div>
      </div>

      <div className="flex justify-center -my-8 relative z-10">
        <div className="bg-cyan-500 text-black p-2 rounded-full border-[6px] border-[#0d1117] font-bold shadow-lg">+</div>
      </div>

      {/* Box Token B */}
      <div className="bg-black/50 p-4 rounded-3xl border border-white/5">
        <div className="flex justify-between items-center mb-2">
          <select 
            className="bg-slate-900 text-white font-bold rounded-xl px-2 py-1 outline-none text-xs border border-white/10"
            value={tokenB.address}
            onChange={(e) => setTokenB(TOKEN_LIST.find(t => t.address === e.target.value))}
          >
            {TOKEN_LIST.map(t => <option key={t.address} value={t.address}>{t.symbol}</option>)}
          </select>
          <div className="text-right">
            <p className="text-[10px] text-slate-500 font-bold uppercase">Balance</p>
            <p className="text-xs text-cyan-400 font-mono">{balB ? Number(balB.formatted).toFixed(4) : "0.00"}</p>
          </div>
        </div>
        <div className="flex items-center">
          <input type="number" value={amountB} onChange={(e) => setAmountB(e.target.value)} placeholder="0.0" className="w-full bg-transparent text-white text-2xl font-black outline-none" />
          <button onClick={() => setAmountB(balB?.formatted || "0")} className="text-[10px] bg-cyan-500/20 text-cyan-400 px-2 py-1 rounded-lg font-bold hover:bg-cyan-500 hover:text-black transition-all">MAX</button>
        </div>
      </div>

      <button
        onClick={handleAdd}
        disabled={loading || !isConnected}
        className="w-full bg-cyan-500 hover:bg-cyan-400 disabled:bg-slate-800 disabled:text-slate-500 text-black font-black py-4 rounded-3xl transition-all uppercase text-xs mt-2 shadow-lg active:scale-95"
      >
        {loading ? (
          <span className="flex items-center justify-center gap-2">
            <div className="w-3 h-3 border-2 border-black border-t-transparent rounded-full animate-spin"></div>
            Processing...
          </span>
        ) : 'Supply Liquidity'}
      </button>

      <div className="flex justify-between text-[9px] text-slate-600 font-bold uppercase px-2">
        <span>Celes Testnet V2</span>
        <span className="text-cyan-900">Chain ID: 22225</span>
      </div>
    </div>
  );
};

export default AddLiquidity;