import React, { useState } from 'react';
import { ConnectKitButton } from 'connectkit';
import { useAccount, useChainId } from 'wagmi';

// Komponen lo
import Swap from './components/Swap';
import Stake from './components/Stake';
import AddLiquidity from './components/AddLiquidity';
import RemoveLiquidity from './components/RemoveLiquidity';

function App() {
  const [tab, setTab] = useState('swap');
  const [poolMode, setPoolMode] = useState('add');

  const { isConnected } = useAccount();
  const chainId = useChainId();

  // AMANKAN ALAMAT ROUTER
  // Ganti 0x675... dengan alamat Router Celes kamu yang asli buat jaga-jaga kalau .env error
  const ROUTER_ADDR = process.env.REACT_APP_ROUTER_ADDRESS || "0x675402035F9F7E0A2416f733698889370726B1E3";

  return (
    <div className="min-h-screen bg-[#020617] text-slate-200 font-sans selection:bg-cyan-500/30">
      <div className="fixed inset-0 bg-[radial-gradient(circle_at_50%_50%,rgba(14,165,233,0.1),transparent_50%)] pointer-events-none" />

      <div className="relative z-10 w-full max-w-md mx-auto pt-12 px-4">
        {/* Header */}
        <div className="flex justify-between items-center mb-8 bg-white/5 p-4 rounded-[2.5rem] border border-white/10 backdrop-blur-xl">
          <div className="pl-2">
            <h1 className="text-xl font-black tracking-tighter text-white italic">EX</h1>
            <p className="text-[10px] font-bold text-cyan-500 tracking-[0.3em] uppercase opacity-80">
              net V2
            </p>
          </div>
          <ConnectKitButton />
        </div>

        {/* Tab Menu */}
        <div className="flex bg-black/40 p-1.5 rounded-[2rem] border border-white/5 mb-6 backdrop-blur-md">
          {['swap', 'pool', 'stake'].map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`flex-1 py-3 rounded-[1.5rem] text-[11px] font-black uppercase tracking-widest transition-all ${
                tab === t
                  ? 'bg-cyan-500 text-black shadow-lg shadow-cyan-500/20'
                  : 'text-slate-500 hover:text-slate-300'
              }`}
            >
              {t}
            </button>
          ))}
        </div>

        {/* Konten Utama */}
        <div className="min-h-[340px] bg-white/5 p-6 rounded-[3rem] border border-white/10 backdrop-blur-2xl shadow-2xl relative">
          {!isConnected ? (
            <div className="flex flex-col items-center justify-center h-[300px] space-y-4">
              <span className="text-4xl animate-bounce">🛰️</span>
              <p className="text-cyan-100/60 text-sm font-medium text-center">
                Connect wallet to explore<br />CelesChain Ecosystem
              </p>
            </div>
          ) : (
            <div className="animate-in fade-in zoom-in duration-500">
              {tab === 'swap' && <Swap routerAddr={ROUTER_ADDR} />}

              {tab === 'pool' && (
                <div className="space-y-4">
                  <div className="flex gap-2 p-1 bg-black/20 rounded-2xl border border-white/5">
                    <button
                      onClick={() => setPoolMode('add')}
                      className={`flex-1 py-2 rounded-xl text-[9px] font-black uppercase transition-all ${
                        poolMode === 'add' ? 'bg-white/10 text-white' : 'text-slate-500 hover:text-slate-400'
                      }`}
                    >
                      Add Liquidity
                    </button>
                    <button
                      onClick={() => setPoolMode('remove')}
                      className={`flex-1 py-2 rounded-xl text-[9px] font-black uppercase transition-all ${
                        poolMode === 'remove' ? 'bg-white/10 text-white' : 'text-slate-500 hover:text-slate-400'
                      }`}
                    >
                      Remove
                    </button>
                  </div>

                  {/* PAKAI KEY AGAR KOMPONEN RE-MOUNT */}
                  {poolMode === 'add' ? (
                    <AddLiquidity key="add-liq" routerAddr={ROUTER_ADDR} />
                  ) : (
                    <RemoveLiquidity key="rem-liq" routerAddr={ROUTER_ADDR} />
                  )}
                </div>
              )}

              {tab === 'stake' && <Stake />}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="mt-8 px-6 flex justify-between items-center text-[10px] font-black text-slate-600 uppercase tracking-[0.2em]">
          <div className="flex items-center gap-2">
            <div className={`w-1.5 h-1.5 rounded-full ${isConnected ? 'bg-green-500 animate-pulse' : 'bg-slate-700'}`} />
            <span>{isConnected ? 'Network Connected' : 'Waiting for Connection'}</span>
          </div>
          <span>Net ID: {chainId?.toString() || '22225'}</span>
        </div>
      </div>
    </div>
  );
}

export default App;