"use client";

import { useState } from "react";
import { auth, db } from "../../lib/firebase"; // db import kiya
import { GoogleAuthProvider, signInWithPopup, sendSignInLinkToEmail } from "firebase/auth";
import { doc, setDoc, getDoc } from "firebase/firestore"; // Firestore tools import kiye
import { useRouter } from "next/navigation"; // Router import kiya
import { motion } from "framer-motion";
import { WalletCards, Mail, ChevronRight } from "lucide-react";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const router = useRouter(); // Redirect karne ke liye

  // User data ko database mein save karne ka function
  const saveUserToDatabase = async (user: any) => {
    const userRef = doc(db, "users", user.uid);
    const userSnap = await getDoc(userRef);

    // Agar user pehle se nahi hai, tabhi save karo (taaki purana data overwrite na ho)
    if (!userSnap.exists()) {
      await setDoc(userRef, {
        uid: user.uid,
        email: user.email,
        name: user.displayName || "Unknown User",
        upiId: "", // Default khali chhod rahe hain
        joinedAt: new Date().toISOString(),
      });
    }
  };

  const handleGoogleLogin = async () => {
    try {
      const provider = new GoogleAuthProvider();
      const result = await signInWithPopup(auth, provider);
      
      setMessage("Login successful! Redirecting...");
      
      // Database mein save karein
      await saveUserToDatabase(result.user);
      
      // Dashboard par bhej dein
      router.push("/dashboard");
      
    } catch (error) {
      console.error(error);
      setMessage("Google login failed. Please try again.");
    }
  };

  const handleEmailLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    const actionCodeSettings = {
      url: 'http://localhost:3000/login', // Baad mein isko handle karenge verification ke liye
      handleCodeInApp: true,
    };

    try {
      await sendSignInLinkToEmail(auth, email, actionCodeSettings);
      window.localStorage.setItem("emailForSignIn", email);
      setMessage("📩 Login link sent! Check your inbox.");
    } catch (error) {
      console.error(error);
      setMessage("Error sending email. Try again.");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#F5F5F7] p-6 font-sans">
      <motion.div 
        initial={{ opacity: 0, y: 30 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, ease: [0.23, 1, 0.32, 1] }}
        className="max-w-[400px] w-full"
      >
        <div className="bg-white rounded-[32px] shadow-[0_8px_30px_rgb(0,0,0,0.04)] p-10">
          
          <div className="flex flex-col items-center text-center mb-10">
            <motion.div 
              initial={{ scale: 0.8 }}
              animate={{ scale: 1 }}
              transition={{ delay: 0.2, type: "spring", stiffness: 200 }}
              className="w-16 h-16 bg-black rounded-2xl flex items-center justify-center shadow-lg mb-6"
            >
              <WalletCards className="text-white w-8 h-8" strokeWidth={1.5} />
            </motion.div>
            <h1 className="text-[28px] font-semibold text-[#1D1D1F] tracking-tight leading-tight">
              Flatmate Ledger
            </h1>
            <p className="text-[#86868B] mt-2 text-[15px]">
              Split expenses with elegance.
            </p>
          </div>

          {message && (
            <motion.div 
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              className="bg-[#F5F5F7] text-[#1D1D1F] p-4 rounded-2xl text-[14px] text-center font-medium mb-6"
            >
              {message}
            </motion.div>
          )}

          <form onSubmit={handleEmailLogin} className="space-y-4">
            <div className="relative group">
              <Mail className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-[#86868B] group-focus-within:text-blue-500 transition-colors" />
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="Email address"
                className="w-full bg-[#F5F5F7] text-[#1D1D1F] pl-12 pr-4 py-4 rounded-2xl text-[15px] outline-none border border-transparent focus:border-blue-500 focus:bg-white transition-all"
              />
            </div>
            <motion.button
              whileHover={{ scale: 1.01 }}
              whileTap={{ scale: 0.97 }}
              type="submit"
              disabled={isLoading}
              className="w-full bg-[#0071E3] hover:bg-[#0077ED] text-white py-4 px-4 rounded-2xl text-[15px] font-semibold flex items-center justify-center gap-2 transition-colors shadow-sm"
            >
              {isLoading ? "Sending..." : "Continue with Email"}
              {!isLoading && <ChevronRight className="w-4 h-4" />}
            </motion.button>
          </form>

          <div className="flex items-center justify-between my-8">
            <div className="w-full h-[1px] bg-[#E5E5EA]"></div>
            <span className="px-4 text-[#86868B] text-[13px] font-medium bg-white">OR</span>
            <div className="w-full h-[1px] bg-[#E5E5EA]"></div>
          </div>

          <motion.button
            whileHover={{ scale: 1.01 }}
            whileTap={{ scale: 0.97 }}
            onClick={handleGoogleLogin}
            className="w-full flex items-center justify-center gap-3 bg-white border border-[#E5E5EA] text-[#1D1D1F] py-4 px-4 rounded-2xl text-[15px] font-semibold hover:bg-[#F5F5F7] transition-colors"
          >
            <img src="https://www.svgrepo.com/show/475656/google-color.svg" alt="Google" className="w-5 h-5" />
            Continue with Google
          </motion.button>

        </div>
      </motion.div>
    </div>
  );
}