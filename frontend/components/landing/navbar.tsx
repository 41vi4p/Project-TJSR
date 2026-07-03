'use client';

import Link from 'next/link';
import { useState } from 'react';
import { Menu, X } from 'lucide-react';

import Image from 'next/image';

export function Navbar() {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <nav className="fixed top-0 w-full bg-black/80 backdrop-blur-md border-b border-yellow-400/10 z-50">
      <div className="w-full px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between items-center h-16">
          {/* Left Side: Logo + Nav Links */}
          <div className="flex items-center space-x-10">
            {/* Logo */}
            <Link href="/" className="flex items-center group">
              <Image 
                src="/TJSR.png" 
                alt="TJSR Logo" 
                width={300} 
                height={80} 
                className="w-48 md:w-56 h-auto object-contain"
                priority
              />
            </Link>

            {/* Desktop Menu Links */}
            <div className="hidden md:flex items-center space-x-8">
              <Link href="/" className="text-gray-300 hover:text-white smooth-transition font-medium">
                Home
              </Link>
              <Link href="#features" className="text-gray-300 hover:text-white smooth-transition font-medium">
                Features
              </Link>
              <Link href="/about" className="text-gray-300 hover:text-white smooth-transition font-medium">
                About
              </Link>
            </div>
          </div>

          {/* Right Side: CTA Button */}
          <div className="hidden md:flex items-center">
            <Link href="/auth" className="px-6 py-2 bg-[#FACC15] hover:bg-[#EAB308] rounded-lg text-[#1F2937] font-semibold hover:shadow-lg smooth-transition">
              Get Started
            </Link>
          </div>

          {/* Mobile Menu Button */}
          <button
            onClick={() => setIsOpen(!isOpen)}
            className="md:hidden text-white p-2"
          >
            {isOpen ? <X size={24} /> : <Menu size={24} />}
          </button>
        </div>

        {/* Mobile Menu */}
        {isOpen && (
          <div className="md:hidden pb-4 space-y-3">
            <Link href="/" className="block text-gray-300 hover:text-white py-2">
              Home
            </Link>
            <Link href="#features" className="block text-gray-300 hover:text-white py-2">
              Features
            </Link>
            <Link href="/about" className="block text-gray-300 hover:text-white py-2">
              About
            </Link>

            <Link href="/auth" className="block w-full px-6 py-2 bg-[#FACC15] hover:bg-[#EAB308] rounded-lg text-[#1F2937] font-semibold text-center hover:shadow-lg smooth-transition mt-4">
              Get Started
            </Link>
          </div>
        )}
      </div>
    </nav>
  );
}
