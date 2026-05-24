"use client";

import { useState } from "react";
import { auth, db } from "../../lib/firebase"; 
import { GoogleAuthProvider, signInWithPopup } from "firebase/auth";
import { doc, setDoc, getDoc } from "firebase/firestore"; 
import { useRouter } from "next/navigation"; 
import { motion } from "framer-motion";
import { WalletCards, Loader2 } from "lucide-react";

export default function LoginPage() {
  const [message, setMessage] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const router = useRouter(); 

  // User data ko database mein save karne ka function
  const saveUserToDatabase = async (user: any) => {
    const userRef = doc(db, "users", user.uid);
    const userSnap = await getDoc(userRef);

    // Agar user pehle se nahi hai, tabhi save karo
    if (!userSnap.exists()) {
      await setDoc(userRef, {
        uid: user.uid,
        email: user.email,
        name: user.displayName || "Unknown User",
        upiId: "", 
        joinedAt: new Date().toISOString(),
      });
    }
  };

  const handleGoogleLogin = async () => {
    setIsLoading(true);
    setMessage("");
    try {
      const provider = new GoogleAuthProvider();
      const result = await signInWithPopup(auth, provider);
      
      setMessage("Login successful! Redirecting...");
      
      // Database mein save karein
      await saveUserToDatabase(result.user);
      
      // Dashboard par bhej dein
      router.push("/dashboard");
      
    } catch (error: any) {
      console.error(error);
      setMessage("Google login failed. Make sure your Vercel domain is added in Firebase Authorized Domains.");
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
              className={`p-4 rounded-2xl text-[14px] text-center font-medium mb-6 ${message.includes("failed") ? "bg-red-50 text-red-600 border border-red-100" : "bg-green-50 text-green-600 border border-green-100"}`}
            >
              {message}
            </motion.div>
          )}

          <motion.button
            whileHover={{ scale: 1.01 }}
            whileTap={{ scale: 0.97 }}
            onClick={handleGoogleLogin}
            disabled={isLoading}
            className="w-full flex items-center justify-center gap-3 bg-[#1D1D1F] text-white py-4 px-4 rounded-2xl text-[15px] font-semibold hover:bg-black transition-colors disabled:opacity-70 shadow-sm"
          >
            {isLoading ? (
              <Loader2 className="w-5 h-5 animate-spin" />
            ) : (
              <>
                <div className="bg-white p-1 rounded-full flex items-center justify-center">
                  <img 
                    src="https://www.svgrepo.com/show/475656/google-color.svg" 
                    alt="Google" 
                    style={{ width: "16px", height: "16px" }} 
                  />
                </div>
                Continue with Google
              </>
            )}
          </motion.button>

        </div>
      </motion.div>
    </div>
  );
}