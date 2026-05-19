/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { PackageOpen } from 'lucide-react';

interface LogoProps {
  className?: string;
  size?: 'sm' | 'md' | 'lg';
}

export default function Logo({ className = '', size = 'md' }: LogoProps) {
  const sizeClasses = {
    sm: 'px-3 py-1.5 text-sm',
    md: 'px-5 py-2.5 text-lg md:text-xl',
    lg: 'px-8 py-4 text-2xl md:text-3xl',
  };

  const iconSizes = {
    sm: 16,
    md: 24,
    lg: 32,
  };

  return (
    <div 
      id="bv-atacarejo-logo"
      className={`inline-flex items-center gap-3 bg-black text-white hover:bg-neutral-900 duration-200 uppercase font-extrabold tracking-wider rounded-lg border border-neutral-800 ${sizeClasses[size]} ${className}`}
      style={{ boxShadow: '0 4px 20px rgba(0, 0, 0, 0.4)' }}
    >
      <div className="flex items-center justify-center bg-white text-black p-1 rounded">
        <PackageOpen size={iconSizes[size]} strokeWidth={2.5} />
      </div>
      <div className="flex flex-col items-start leading-none">
        <span className="font-sans font-black tracking-tighter text-white">
          BV <span className="text-amber-400">ATACAREJO</span>
        </span>
        <span className="text-[9px] md:text-[10px] tracking-widest text-neutral-400 font-medium">
          LOGÍSTICA & ESTOQUE
        </span>
      </div>
    </div>
  );
}
