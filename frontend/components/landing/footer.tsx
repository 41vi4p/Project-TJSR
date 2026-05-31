'use client';

import Link from 'next/link';
import { Github, Twitter, Linkedin, Mail } from 'lucide-react';

import Image from 'next/image';

export function Footer() {
  return (
    <footer className="border-t border-purple-500/10 bg-black py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-7xl mx-auto">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-8 mb-8">
          {/* Brand */}
          <div>
            <div className="flex items-center space-x-2 mb-4">
              <Image 
                src="/TJSR.png" 
                alt="TJSR Logo" 
                width={400} 
                height={120} 
                className="w-64 h-auto object-contain"
              />
            </div>
            <p className="text-gray-400 text-sm">AI-powered job discovery for the next generation.</p>
          </div>

          {/* Product */}
          <div>
            <h3 className="text-white font-semibold mb-4">Product</h3>
            <ul className="space-y-2 text-sm text-gray-400">
              <li><Link href="#" className="hover:text-white smooth-transition">Features</Link></li>
              <li><Link href="#" className="hover:text-white smooth-transition">Security</Link></li>
              <li><Link href="#" className="hover:text-white smooth-transition">Roadmap</Link></li>
            </ul>
          </div>

          {/* Company */}
          <div>
            <h3 className="text-white font-semibold mb-4">Company</h3>
            <ul className="space-y-2 text-sm text-gray-400">
              <li><Link href="#" className="hover:text-white smooth-transition">About</Link></li>
              <li><Link href="#" className="hover:text-white smooth-transition">Blog</Link></li>
              <li><Link href="#" className="hover:text-white smooth-transition">Careers</Link></li>
              <li><Link href="#" className="hover:text-white smooth-transition">Contact</Link></li>
            </ul>
          </div>

          {/* Legal */}
          <div>
            <h3 className="text-white font-semibold mb-4">Legal</h3>
            <ul className="space-y-2 text-sm text-gray-400">
              <li><Link href="#" className="hover:text-white smooth-transition">Privacy</Link></li>
              <li><Link href="#" className="hover:text-white smooth-transition">Terms</Link></li>
              <li><Link href="#" className="hover:text-white smooth-transition">Cookies</Link></li>
              <li><Link href="#" className="hover:text-white smooth-transition">Sitemap</Link></li>
            </ul>
          </div>
        </div>

        {/* Bottom Section */}
        <div className="border-t border-purple-500/10 pt-8 flex flex-col md:flex-row justify-between items-center">
          <p className="text-gray-400 text-sm mb-4 md:mb-0">© 2024 TJSR. All rights reserved.</p>
          
          <div className="flex items-center space-x-6">
            <a href="#" className="text-gray-400 hover:text-purple-400 smooth-transition">
              <Twitter size={20} />
            </a>
            <a href="#" className="text-gray-400 hover:text-purple-400 smooth-transition">
              <Github size={20} />
            </a>
            <a href="#" className="text-gray-400 hover:text-purple-400 smooth-transition">
              <Linkedin size={20} />
            </a>
            <a href="#" className="text-gray-400 hover:text-purple-400 smooth-transition">
              <Mail size={20} />
            </a>
          </div>
        </div>
      </div>
    </footer>
  );
}
