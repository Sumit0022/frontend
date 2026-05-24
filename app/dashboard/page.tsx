"use client";

import { useEffect, useState } from "react";
import { auth, db } from "../../lib/firebase";
import { doc, getDoc, setDoc, updateDoc, arrayUnion, arrayRemove, collection, query, where, getDocs } from "firebase/firestore";
import { useRouter } from "next/navigation";
import { LogOut, Home, Plus, Users, Activity, X, Loader2, MapPin, LocateFixed, Menu, Settings, UserMinus, History, ChevronRight, ChevronLeft, Receipt, Banknote } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

export default function Dashboard() {
  const [user, setUser] = useState<any>(null);
  const [userData, setUserData] = useState<any>(null);
  const [flatData, setFlatData] = useState<any>(null);
  const [flatMembers, setFlatMembers] = useState<any[]>([]); 
  const [flatTransactions, setFlatTransactions] = useState<any[]>([]); // Current flat transactions
  const [isLoading, setIsLoading] = useState(true);
  
  // UI States
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [modalType, setModalType] = useState<"create" | "join" | "leaveConfirm" | "transferAdmin" | "pastFlats" | "editFlat" | "pastFlatHistory" | "addExpense" | null>(null);
  
  // Form States
  const [inputValue, setInputValue] = useState("");
  const [address, setAddress] = useState("");
  const [maxMates, setMaxMates] = useState("4");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");
  const [isFetchingLoc, setIsFetchingLoc] = useState(false);
  
  // Add Expense States
  const [expenseDesc, setExpenseDesc] = useState("");
  const [expenseAmt, setExpenseAmt] = useState("");
  const [splitType, setSplitType] = useState("all"); 
  const [splitAmong, setSplitAmong] = useState<string[]>([]); 

  // Transfer Admin & Past Flat States
  const [otherMembers, setOtherMembers] = useState<any[]>([]);
  const [selectedNewAdmin, setSelectedNewAdmin] = useState("");
  const [selectedPastFlat, setSelectedPastFlat] = useState<any>(null);
  const [pastTransactions, setPastTransactions] = useState<any[]>([]);

  const router = useRouter();

  const loadData = async (currentUser: any) => {
    const userRef = doc(db, "users", currentUser.uid);
    const userSnap = await getDoc(userRef);
    if (userSnap.exists()) {
      const uData = userSnap.data();
      setUserData(uData);
      
      if (uData.flatId) {
        const flatSnap = await getDoc(doc(db, "flats", uData.flatId));
        if (flatSnap.exists()) {
          const fData = flatSnap.data();
          setFlatData(fData);
          
          if (fData.members && fData.members.length > 0) {
             const memberPromises = fData.members.map((id: string) => getDoc(doc(db, "users", id)));
             const memberSnaps = await Promise.all(memberPromises);
             setFlatMembers(memberSnaps.map(snap => snap.data()));

             // Fetch active transactions for balances
             const q = query(collection(db, "transactions"), where("flatId", "==", uData.flatId));
             const txnsSnap = await getDocs(q);
             setFlatTransactions(txnsSnap.docs.map(d => d.data()));
          }
        }
      } else {
        setFlatData(null);
        setFlatMembers([]);
        setFlatTransactions([]);
      }
    }
  };

  useEffect(() => {
    const unsubscribe = auth.onAuthStateChanged(async (currentUser) => {
      if (!currentUser) router.push("/login");
      else {
        setUser(currentUser);
        await loadData(currentUser);
        setIsLoading(false);
      }
    });
    return () => unsubscribe();
  }, [router]);

  const handleLogout = () => auth.signOut();

  // --- LOCATION FETCH ---
  const handleFetchLocation = () => {
    if (!navigator.geolocation) return setErrorMsg("Location support nahi hai.");
    setIsFetchingLoc(true); setErrorMsg("");
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        try {
          const { latitude, longitude } = pos.coords;
          const res = await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${latitude}&lon=${longitude}`);
          const data = await res.json();
          if (data?.display_name) setAddress(data.display_name);
        } catch (e) { setErrorMsg("Location fetch fail hua."); }
        finally { setIsFetchingLoc(false); }
      },
      () => { setErrorMsg("Location permission denied."); setIsFetchingLoc(false); }
    );
  };

  // --- CREATE FLAT ---
  const handleCreateFlat = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputValue || !address) return;
    setIsSubmitting(true);
    try {
      const flatId = Math.random().toString(36).substring(2, 8).toUpperCase();
      await setDoc(doc(db, "flats", flatId), {
        flatId, flatName: inputValue, address, maxMates: Number(maxMates),
        members: [user.uid], createdBy: user.uid, createdAt: new Date().toISOString()
      });
      await updateDoc(doc(db, "users", user.uid), { flatId });
      await loadData(user); closeModal();
    } catch (e) { setErrorMsg("Error creating flat."); }
    finally { setIsSubmitting(false); }
  };

  // --- EDIT FLAT ---
  const openEditModal = () => {
    if (!flatData) return;
    setInputValue(flatData.flatName);
    setAddress(flatData.address || "");
    setMaxMates(flatData.maxMates?.toString() || "4");
    setIsMenuOpen(false);
    setModalType("editFlat");
  };

  const handleEditFlat = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputValue || !address) return;
    setIsSubmitting(true);
    try {
      await updateDoc(doc(db, "flats", userData.flatId), {
        flatName: inputValue, address, maxMates: Number(maxMates)
      });
      await loadData(user); closeModal();
    } catch (e) { setErrorMsg("Error updating flat."); }
    finally { setIsSubmitting(false); }
  };

  // --- JOIN FLAT ---
  const handleJoinFlat = async (e: React.FormEvent) => {
    e.preventDefault();
    const joinCode = inputValue.toUpperCase();
    setIsSubmitting(true);
    try {
      const flatRef = doc(db, "flats", joinCode);
      const flatSnap = await getDoc(flatRef);
      if (!flatSnap.exists()) { setErrorMsg("Flat not found."); setIsSubmitting(false); return; }
      const fData = flatSnap.data();
      if (fData.members.length >= fData.maxMates) { setErrorMsg("Flat is full!"); setIsSubmitting(false); return; }
      await updateDoc(flatRef, { members: arrayUnion(user.uid) });
      await updateDoc(doc(db, "users", user.uid), { flatId: joinCode });
      await loadData(user); closeModal();
    } catch (e) { setErrorMsg("Error joining flat."); }
    finally { setIsSubmitting(false); }
  };

  // --- LEAVE FLAT ---
  const initiateLeaveFlat = async () => {
    setIsMenuOpen(false);
    if (!flatData || !userData) return;
    if (flatData.createdBy === user.uid && flatData.members.length > 1) {
      setIsLoading(true);
      const others = [];
      for (const memberId of flatData.members) {
        if (memberId !== user.uid) {
          const mSnap = await getDoc(doc(db, "users", memberId));
          if (mSnap.exists()) others.push(mSnap.data());
        }
      }
      setOtherMembers(others);
      if (others.length > 0) setSelectedNewAdmin(others[0].uid);
      setIsLoading(false); setModalType("transferAdmin");
    } else {
      setModalType("leaveConfirm");
    }
  };

  const executeLeaveFlat = async (newAdminId: any = null) => {
    setIsSubmitting(true);
    try {
      const flatRef = doc(db, "flats", userData.flatId);
      const userRef = doc(db, "users", user.uid);
      if (newAdminId) await updateDoc(flatRef, { createdBy: newAdminId });
      await updateDoc(flatRef, { members: arrayRemove(user.uid) });
      await updateDoc(userRef, { 
        flatId: null,
        pastFlats: arrayUnion({ flatId: userData.flatId, flatName: flatData?.flatName || "Unknown Flat", leftAt: new Date().toISOString() })
      });
      await loadData(user); closeModal();
    } catch (e) { setErrorMsg("Error leaving flat."); setIsSubmitting(false); }
  };

  // --- VIEW PAST FLAT TRANSACTIONS ---
  const handleViewPastFlat = async (pf: any) => {
    setSelectedPastFlat(pf);
    setModalType("pastFlatHistory");
    setIsSubmitting(true); 
    try {
      const q = query(collection(db, "transactions"), where("flatId", "==", pf.flatId));
      const querySnapshot = await getDocs(q);
      const txns = querySnapshot.docs.map(doc => doc.data());
      setPastTransactions(txns);
    } catch (error) {
      console.error("Error fetching past transactions:", error);
    } finally {
      setIsSubmitting(false);
    }
  };

  // --- ADD EXPENSE LOGIC ---
  const handleAddExpense = async (e: React.FormEvent) => {
    e.preventDefault();
    const finalSplit = splitType === "all" ? flatMembers.map(m => m.uid) : splitAmong;
    
    if (!expenseDesc || !expenseAmt || finalSplit.length === 0) {
      setErrorMsg("Please select at least one person to split with.");
      return;
    }
    
    setIsSubmitting(true);
    setErrorMsg("");

    try {
      const txnId = "txn_" + Date.now(); 
      await setDoc(doc(db, "transactions", txnId), {
        transactionId: txnId,
        flatId: userData.flatId,
        description: expenseDesc,
        amount: Number(expenseAmt),
        paidBy: user.uid, // Jo add kar raha hai, wahi pay kar raha hai
        splitAmong: finalSplit, // Kin logo me divide karna hai
        date: new Date().toISOString(),
        type: "expense"
      });
      await loadData(user); 
      closeModal();
    } catch (error) {
      setErrorMsg("Expense add karne mein error aayi.");
      console.error(error);
    } finally {
      setIsSubmitting(false);
    }
  };

  // --- CALCULATE BALANCES ---
  const calculateBalances = () => {
    const balances: any = {};
    flatMembers.forEach(m => balances[m.uid] = 0);

    flatTransactions.forEach(txn => {
      const splitCount = txn.splitAmong?.length || 1;
      const splitAmount = txn.amount / splitCount;

      // Jisne pay kiya, uska balance badhega
      balances[txn.paidBy] = (balances[txn.paidBy] || 0) + txn.amount;
      
      // Jisme split hua, unka balance ghatega
      txn.splitAmong?.forEach((uid: string) => {
        balances[uid] = (balances[uid] || 0) - splitAmount;
      });
    });
    return balances;
  };

  const closeModal = () => {
    setModalType(null); setErrorMsg(""); setInputValue(""); setAddress(""); setMaxMates("4");
    setExpenseDesc(""); setExpenseAmt(""); setSplitType("all"); setSplitAmong([]);
  };

  if (isLoading) return <div className="min-h-screen bg-[#F5F5F7] flex items-center justify-center"><Loader2 className="w-8 h-8 text-[#0071E3] animate-spin" /></div>;

  const getInitials = (name: string) => name ? name.charAt(0).toUpperCase() : "U";
  const balances = calculateBalances();
  const myBalance = balances[user?.uid] || 0;

  return (
    <div className="min-h-screen bg-[#F5F5F7] text-[#1D1D1F] font-sans pb-10 overflow-x-hidden">
      
      {/* --- NAVBAR --- */}
      <nav className="bg-white/80 backdrop-blur-md border-b border-gray-200 px-4 sm:px-6 py-4 sticky top-0 z-40">
        <div className="max-w-5xl mx-auto flex justify-between items-center">
          <h1 className="text-[26px] font-extrabold tracking-tight text-[#1D1D1F] lowercase">flatmates.</h1>
          <button onClick={() => setIsMenuOpen(true)} className="p-2 hover:bg-gray-100 rounded-full transition-colors active:scale-95">
            <Menu className="w-6 h-6 text-[#1D1D1F]" />
          </button>
        </div>
      </nav>

      {/* --- SLIDE-IN MOBILE MENU --- */}
      <AnimatePresence>
        {isMenuOpen && (
          <>
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setIsMenuOpen(false)} className="fixed inset-0 bg-black/20 backdrop-blur-sm z-50" />
            <motion.div initial={{ x: "100%" }} animate={{ x: 0 }} exit={{ x: "100%" }} transition={{ type: "spring", damping: 25, stiffness: 200 }} className="fixed top-0 right-0 bottom-0 w-[280px] bg-white shadow-2xl z-50 flex flex-col p-6">
              <div className="flex justify-between items-center mb-8">
                <h2 className="font-bold text-xl">Menu</h2>
                <button onClick={() => setIsMenuOpen(false)} className="p-2 bg-[#F5F5F7] hover:bg-gray-200 rounded-full transition-colors"><X className="w-5 h-5" /></button>
              </div>
              <div className="space-y-2 flex-grow">
                {userData?.flatId && (
                  <>
                    {flatData?.createdBy === user.uid && (
                      <button onClick={openEditModal} className="w-full flex items-center gap-3 p-3 hover:bg-[#F5F5F7] rounded-xl font-medium transition-colors text-left active:scale-95">
                        <Settings className="w-5 h-5 text-gray-500" /> Edit Flat Details
                      </button>
                    )}
                    <button onClick={initiateLeaveFlat} className="w-full flex items-center gap-3 p-3 hover:bg-red-50 rounded-xl font-medium text-red-600 transition-colors text-left active:scale-95">
                      <UserMinus className="w-5 h-5" /> Leave Flat
                    </button>
                  </>
                )}
                {userData?.pastFlats?.length > 0 && (
                  <button onClick={() => { setIsMenuOpen(false); setModalType("pastFlats"); }} className="w-full flex items-center gap-3 p-3 hover:bg-[#F5F5F7] rounded-xl font-medium transition-colors text-left mt-4 border-t border-gray-100 pt-4 active:scale-95">
                    <History className="w-5 h-5 text-gray-500" /> Previous Flats
                  </button>
                )}
              </div>
              <button onClick={handleLogout} className="w-full flex items-center justify-center gap-2 p-4 bg-red-50 text-red-600 rounded-xl font-bold mt-auto hover:bg-red-100 transition-colors active:scale-95">
                <LogOut className="w-5 h-5" /> Logout
              </button>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* --- MAIN CONTENT --- */}
      <main className="max-w-5xl mx-auto px-4 sm:px-6 mt-8 sm:mt-10 relative">
        <div className="flex items-center justify-between mb-8">
          <div>
            <h2 className="text-2xl sm:text-3xl font-bold text-[#1D1D1F] tracking-tight">Hello, {user.displayName?.split(" ")[0]}</h2>
            <p className="text-[#86868B] text-sm sm:text-base mt-1">Manage your shared expenses simply.</p>
          </div>
          {user.photoURL ? (
            <img src={user.photoURL} alt="Profile" className="w-12 h-12 rounded-full shadow-sm bg-white border border-gray-200 object-cover" onError={(e) => (e.currentTarget.style.display = 'none')} />
          ) : (
             <div className="w-12 h-12 rounded-full bg-[#0071E3]/10 text-[#0071E3] flex items-center justify-center font-bold text-lg shadow-sm">
               {getInitials(user.displayName)}
             </div>
          )}
        </div>

        {!userData?.flatId ? (
          <motion.div initial={{ opacity: 0, scale: 0.98 }} animate={{ opacity: 1, scale: 1 }} className="bg-white rounded-[24px] shadow-[0_8px_30px_rgb(0,0,0,0.04)] border border-gray-100 p-6 sm:p-10 text-center max-w-2xl mx-auto mt-8">
            <div className="w-16 h-16 bg-[#0071E3]/10 rounded-2xl flex items-center justify-center mx-auto mb-6"><Home className="w-8 h-8 text-[#0071E3]" /></div>
            <h3 className="text-xl font-bold mb-3">You don't have a Flat yet</h3>
            <p className="text-[#86868B] mb-8 max-w-md mx-auto">Create a new group or join an existing flat.</p>
            <div className="flex flex-col sm:flex-row gap-3 justify-center">
              <button onClick={() => setModalType("create")} className="w-full sm:w-auto bg-[#0071E3] text-white px-8 py-3.5 rounded-xl font-semibold flex justify-center items-center gap-2 active:scale-95 transition-all shadow-sm"><Plus className="w-5 h-5"/> Create Flat</button>
              <button onClick={() => setModalType("join")} className="w-full sm:w-auto bg-[#F5F5F7] text-[#1D1D1F] px-8 py-3.5 rounded-xl font-semibold flex justify-center items-center gap-2 active:scale-95 transition-all"><Users className="w-5 h-5"/> Join Flat</button>
            </div>
          </motion.div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            
            {/* FLAT DETAILS & ACTIVITY */}
            <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="md:col-span-2 bg-white rounded-[24px] shadow-[0_8px_30px_rgb(0,0,0,0.04)] border border-gray-100 p-6 sm:p-8 flex flex-col">
               <div className="flex justify-between items-start mb-6">
                 <div>
                   <h3 className="font-bold text-2xl">{flatData?.flatName}</h3>
                   <p className="text-sm text-[#86868B] mt-1 flex items-center gap-1"><MapPin className="w-3 h-3"/> {flatData?.address?.split(',')[0]}</p>
                 </div>
                 <div className="bg-[#F5F5F7] px-3 py-1.5 rounded-xl text-sm font-medium text-[#86868B] border border-gray-200">
                   Code: <span className="text-[#1D1D1F] font-bold tracking-wider">{userData.flatId}</span>
                 </div>
               </div>
               
               {/* FLATMATES AVATAR ROW */}
               <div className="mb-8">
                 <p className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-3">Members ({flatMembers.length}/{flatData?.maxMates})</p>
                 <div className="flex flex-wrap gap-2">
                    {flatMembers.map((member, i) => (
                      <div key={i} className="flex items-center gap-2 bg-[#F5F5F7] pr-3 pl-1 py-1 rounded-full border border-gray-100">
                        {member.photoURL ? (
                          <img src={member.photoURL} alt={member.name} className="w-7 h-7 rounded-full object-cover" onError={(e) => (e.currentTarget.style.display = 'none')} />
                        ) : (
                          <div className="w-7 h-7 rounded-full bg-white text-[#1D1D1F] flex items-center justify-center text-xs font-bold shadow-sm">
                            {getInitials(member.name)}
                          </div>
                        )}
                        <span className="text-sm font-medium text-[#1D1D1F]">{member.name?.split(" ")[0]}</span>
                      </div>
                    ))}
                 </div>
               </div>

               {/* RECENT TRANSACTIONS */}
               <div className="flex-grow flex flex-col bg-gray-50 rounded-2xl border border-dashed border-gray-200 p-4 overflow-y-auto max-h-[250px]">
                 {flatTransactions.length === 0 ? (
                    <div className="flex flex-col items-center justify-center h-full text-[#86868B] py-6">
                      <Receipt className="w-8 h-8 text-gray-300 mb-2" />
                      <p className="text-sm font-medium">No expenses added yet.</p>
                    </div>
                 ) : (
                    <div className="space-y-3">
                      {flatTransactions.sort((a,b) => new Date(b.date).getTime() - new Date(a.date).getTime()).map((txn, i) => (
                        <div key={i} className="flex justify-between items-center p-3 bg-white rounded-xl border border-gray-100 shadow-sm">
                           <div>
                             <p className="font-bold text-sm text-[#1D1D1F]">{txn.description}</p>
                             <p className="text-xs text-gray-400 mt-0.5">
                               {new Date(txn.date).toLocaleDateString()} • Paid by {txn.paidBy === user.uid ? "You" : flatMembers.find(m => m.uid === txn.paidBy)?.name?.split(" ")[0]}
                             </p>
                           </div>
                           <p className="font-bold text-[#1D1D1F]">₹{txn.amount}</p>
                        </div>
                      ))}
                    </div>
                 )}
               </div>
               
               {/* ADD EXPENSE BUTTON */}
               <button 
                 onClick={() => { setSplitType("all"); setSplitAmong([]); setModalType("addExpense"); }} 
                 className="mt-6 w-full bg-[#0071E3] hover:bg-[#0077ED] text-white py-3.5 rounded-xl font-semibold flex justify-center items-center gap-2 active:scale-95 transition-all shadow-sm"
               >
                 <Plus className="w-5 h-5"/> Add New Expense
               </button>

            </motion.div>

            {/* QUICK STATS & BALANCES */}
            <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }} className="bg-white rounded-[24px] shadow-[0_8px_30px_rgb(0,0,0,0.04)] border border-gray-100 p-6 sm:p-8 flex flex-col">
              <div className="flex items-center gap-2 mb-4 text-[#86868B] font-medium"><Activity className="w-5 h-5" /> Net Balance</div>
              
              <h3 className={`text-4xl font-bold ${myBalance > 0 ? "text-green-600" : myBalance < 0 ? "text-red-600" : "text-[#1D1D1F]"}`}>
                {myBalance > 0 ? "+" : myBalance < 0 ? "-" : ""}₹{Math.abs(Math.round(myBalance))}
              </h3>
              <p className="text-sm text-[#86868B] mt-1 font-medium">
                {myBalance > 0 ? "You get back overall" : myBalance < 0 ? "You owe overall" : "You are all settled up!"}
              </p>

              {/* OTHER MEMBERS BALANCES */}
              <div className="mt-8 space-y-3 border-t border-gray-100 pt-6">
                 <p className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-3">Group Summary</p>
                 {flatMembers.filter(m => m.uid !== user?.uid).map(m => {
                    const b = balances[m.uid] || 0;
                    return (
                       <div key={m.uid} className="flex justify-between items-center text-sm p-2 rounded-lg hover:bg-gray-50 transition-colors">
                         <span className="font-medium text-[#1D1D1F]">{m.name?.split(" ")[0]}</span>
                         <span className={`font-bold ${b > 0 ? "text-green-600" : b < 0 ? "text-red-600" : "text-gray-400"}`}>
                           {b > 0 ? `Gets ₹${Math.abs(Math.round(b))}` : b < 0 ? `Owes ₹${Math.abs(Math.round(b))}` : "Settled"}
                         </span>
                       </div>
                    )
                 })}
                 {flatMembers.length <= 1 && (
                    <p className="text-sm text-gray-400 italic text-center py-2">Add members to see split</p>
                 )}
              </div>

            </motion.div>
          </div>
        )}
      </main>

      {/* --- POPUP MODALS --- */}
      <AnimatePresence>
        {modalType && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={closeModal} className="absolute inset-0 bg-black/30 backdrop-blur-sm" />
            
            <motion.div initial={{ opacity: 0, scale: 0.95, y: 10 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.95, y: 10 }} className="bg-white w-full max-w-md rounded-[24px] shadow-2xl relative z-10 p-6 sm:p-8 overflow-hidden max-h-[90vh] overflow-y-auto">
              {modalType !== "pastFlatHistory" && (
                <button onClick={closeModal} className="absolute top-6 right-6 p-2 bg-[#F5F5F7] hover:bg-gray-200 rounded-full transition-colors active:scale-95"><X className="w-5 h-5 text-[#86868B]" /></button>
              )}

              {/* 1. ADD EXPENSE MODAL */}
              {modalType === "addExpense" && (
                <form onSubmit={handleAddExpense}>
                  <div className="mb-6">
                    <div className="w-12 h-12 bg-[#34C759]/10 rounded-2xl flex items-center justify-center mb-4">
                      <Banknote className="w-6 h-6 text-[#34C759]" />
                    </div>
                    <h3 className="text-2xl font-bold text-[#1D1D1F]">Add Expense</h3>
                    <p className="text-sm text-[#86868B] mt-1">Paid by you</p>
                  </div>
                  {errorMsg && <p className="bg-red-50 text-red-600 p-3 rounded-xl text-sm font-medium mb-4 border border-red-100">{errorMsg}</p>}
                  
                  <div className="space-y-4 mb-8">
                    <div>
                      <label className="block text-sm font-semibold text-[#86868B] mb-2 ml-1">What was this for?</label>
                      <input type="text" required maxLength={40} value={expenseDesc} onChange={(e)=>setExpenseDesc(e.target.value)} placeholder="e.g., Electricity Bill, Groceries" className="w-full bg-[#F5F5F7] text-[#1D1D1F] px-4 py-3.5 rounded-xl text-base outline-none border border-transparent focus:border-[#34C759] focus:bg-white transition-all" />
                    </div>
                    <div>
                      <label className="block text-sm font-semibold text-[#86868B] mb-2 ml-1">Total Amount (₹)</label>
                      <input type="number" required min="1" value={expenseAmt} onChange={(e)=>setExpenseAmt(e.target.value)} placeholder="0.00" className="w-full bg-[#F5F5F7] text-[#1D1D1F] px-4 py-3.5 rounded-xl text-2xl font-bold outline-none border border-transparent focus:border-[#34C759] focus:bg-white transition-all" />
                    </div>
                    
                    {/* DIVIDE AMONG SECTION */}
                    <div className="pt-2">
                       <label className="block text-sm font-semibold text-[#86868B] mb-2 ml-1">Divide among</label>
                       <select value={splitType} onChange={(e)=> { setSplitType(e.target.value); setSplitAmong([]); }} className="w-full bg-[#F5F5F7] text-[#1D1D1F] px-4 py-3.5 rounded-xl text-base outline-none border border-transparent focus:border-[#34C759] focus:bg-white transition-all appearance-none cursor-pointer font-medium">
                          <option value="all">Everyone in Flat</option>
                          <option value="custom">Specific Flatmates</option>
                       </select>

                       {/* CUSTOM CHECKBOX LIST */}
                       {splitType === "custom" && (
                         <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} className="mt-3 space-y-2 bg-[#F5F5F7] p-4 rounded-xl border border-transparent">
                           {flatMembers.map((m) => (
                             <label key={m.uid} className="flex items-center gap-3 cursor-pointer group">
                               <div className={`w-5 h-5 rounded flex items-center justify-center border transition-colors ${splitAmong.includes(m.uid) ? 'bg-[#34C759] border-[#34C759]' : 'bg-white border-gray-300 group-hover:border-gray-400'}`}>
                                 {splitAmong.includes(m.uid) && <svg className="w-3.5 h-3.5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>}
                               </div>
                               <input type="checkbox" className="hidden" checked={splitAmong.includes(m.uid)} onChange={(e) => {
                                   if (e.target.checked) setSplitAmong([...splitAmong, m.uid]);
                                   else setSplitAmong(splitAmong.filter(id => id !== m.uid));
                                 }} 
                               />
                               <span className="text-sm font-medium text-[#1D1D1F]">{m.uid === user.uid ? "You" : m.name}</span>
                             </label>
                           ))}
                         </motion.div>
                       )}
                    </div>
                  </div>
                  
                  <button type="submit" disabled={isSubmitting || !expenseDesc || !expenseAmt || (splitType === "custom" && splitAmong.length === 0)} className="w-full bg-[#34C759] hover:bg-[#2EAF4E] disabled:opacity-50 text-white py-3.5 rounded-xl font-semibold flex items-center justify-center gap-2 transition-all active:scale-95 shadow-sm">
                    {isSubmitting && <Loader2 className="w-5 h-5 animate-spin" />}
                    {!isSubmitting && "Save Expense"}
                  </button>
                </form>
              )}

              {/* 2 & 3. CREATE / EDIT FLAT MODAL */}
              {(modalType === "create" || modalType === "editFlat") && (
                <form onSubmit={modalType === "create" ? handleCreateFlat : handleEditFlat}>
                  <div className="mb-6">
                    <div className="w-12 h-12 bg-[#0071E3]/10 rounded-2xl flex items-center justify-center mb-4">
                      {modalType === "create" ? <Plus className="w-6 h-6 text-[#0071E3]" /> : <Settings className="w-6 h-6 text-[#0071E3]" />}
                    </div>
                    <h3 className="text-2xl font-bold text-[#1D1D1F]">{modalType === "create" ? "Setup New Flat" : "Edit Flat Details"}</h3>
                  </div>
                  {errorMsg && <p className="bg-red-50 text-red-600 p-3 rounded-xl text-sm font-medium mb-4 border border-red-100">{errorMsg}</p>}
                  
                  <div className="space-y-4 mb-8">
                    <div>
                      <label className="block text-sm font-semibold text-[#86868B] mb-2 ml-1">Flat Name</label>
                      <input type="text" required maxLength={30} value={inputValue} onChange={(e)=>setInputValue(e.target.value)} placeholder="e.g., The Boys Flat" className="w-full bg-[#F5F5F7] text-[#1D1D1F] px-4 py-3.5 rounded-xl text-base outline-none border border-transparent focus:border-[#0071E3] focus:bg-white transition-all" />
                    </div>
                    <div>
                      <label className="block text-sm font-semibold text-[#86868B] mb-2 ml-1">Full Address</label>
                      <div className="relative">
                        <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-[#86868B]" />
                        <textarea required rows={2} value={address} onChange={(e)=>setAddress(e.target.value)} placeholder="Enter full address" className="w-full bg-[#F5F5F7] text-[#1D1D1F] pl-10 pr-4 py-3 rounded-xl text-sm outline-none border border-transparent focus:border-[#0071E3] focus:bg-white transition-all resize-none" />
                      </div>
                      <button type="button" onClick={handleFetchLocation} disabled={isFetchingLoc} className="mt-2 flex items-center gap-1.5 text-sm text-[#0071E3] font-semibold hover:opacity-80 active:scale-95 transition-all ml-1">
                        {isFetchingLoc ? <Loader2 className="w-4 h-4 animate-spin" /> : <LocateFixed className="w-4 h-4" />}
                        {isFetchingLoc ? "Fetching..." : "Use current GPS location"}
                      </button>
                    </div>
                    <div>
                       <label className="block text-sm font-semibold text-[#86868B] mb-2 ml-1">Max Flatmates (Capacity)</label>
                       <select value={maxMates} onChange={(e)=>setMaxMates(e.target.value)} className="w-full bg-[#F5F5F7] text-[#1D1D1F] px-4 py-3.5 rounded-xl text-base outline-none border border-transparent focus:border-[#0071E3] focus:bg-white transition-all appearance-none cursor-pointer">
                          <option value="2">2 People</option><option value="3">3 People</option><option value="4">4 People</option><option value="5">5 People</option><option value="6">6 People (Max)</option>
                       </select>
                    </div>
                  </div>
                  <button type="submit" disabled={isSubmitting || !inputValue || !address} className="w-full bg-[#0071E3] hover:bg-[#0077ED] disabled:opacity-50 text-white py-3.5 rounded-xl font-semibold flex items-center justify-center gap-2 transition-all active:scale-95">
                    {isSubmitting && <Loader2 className="w-5 h-5 animate-spin" />}
                    {!isSubmitting && (modalType === "create" ? "Create Flat" : "Save Changes")}
                  </button>
                </form>
              )}

              {/* 4. JOIN FLAT MODAL */}
              {modalType === "join" && (
                <form onSubmit={handleJoinFlat}>
                  <div className="mb-6">
                    <div className="w-12 h-12 bg-[#0071E3]/10 rounded-2xl flex items-center justify-center mb-4"><Users className="w-6 h-6 text-[#0071E3]" /></div>
                    <h3 className="text-2xl font-bold text-[#1D1D1F]">Join a Flat</h3>
                  </div>
                  {errorMsg && <p className="bg-red-50 text-red-600 p-3 rounded-xl text-sm font-medium mb-4 border border-red-100">{errorMsg}</p>}
                  <div className="mb-8">
                     <label className="block text-sm font-semibold text-[#86868B] mb-2 ml-1">Invite Code</label>
                     <input type="text" required maxLength={6} value={inputValue} onChange={(e)=>setInputValue(e.target.value)} placeholder="e.g., A4B9X2" className="w-full bg-[#F5F5F7] text-[#1D1D1F] px-4 py-3.5 rounded-xl text-base outline-none border border-transparent focus:border-[#0071E3] focus:bg-white transition-all uppercase tracking-widest font-bold text-center" />
                  </div>
                  <button type="submit" disabled={isSubmitting || !inputValue} className="w-full bg-[#0071E3] hover:bg-[#0077ED] disabled:opacity-50 text-white py-3.5 rounded-xl font-semibold flex items-center justify-center gap-2 transition-all active:scale-95">
                    {isSubmitting && <Loader2 className="w-5 h-5 animate-spin" />} {!isSubmitting && "Join Flat"}
                  </button>
                </form>
              )}

              {/* 5. PAST FLATS LIST MODAL */}
              {modalType === "pastFlats" && (
                <div>
                  <div className="flex items-center gap-3 mb-6">
                    <div className="p-3 bg-[#0071E3]/10 text-[#0071E3] rounded-2xl"><History className="w-6 h-6"/></div>
                    <h3 className="text-2xl font-bold text-[#1D1D1F]">Previous Flats</h3>
                  </div>
                  <div className="space-y-3">
                    {userData?.pastFlats?.map((pf: any, idx: number) => (
                      <div key={idx} onClick={() => handleViewPastFlat(pf)} className="flex justify-between items-center p-4 bg-[#F5F5F7] border border-transparent hover:border-gray-200 rounded-2xl cursor-pointer group transition-all active:scale-95">
                        <div>
                          <h4 className="font-bold text-[#1D1D1F]">{pf.flatName}</h4>
                          <p className="text-xs text-[#86868B] font-medium mt-1">Left on: {new Date(pf.leftAt).toLocaleDateString()}</p>
                        </div>
                        <div className="w-8 h-8 bg-white rounded-full shadow-sm flex items-center justify-center group-hover:bg-[#0071E3] transition-colors">
                           <ChevronRight className="w-4 h-4 text-gray-400 group-hover:text-white" />
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* 6. PAST FLAT TRANSACTIONS DETAILS MODAL */}
              {modalType === "pastFlatHistory" && (
                <div>
                  <div className="flex items-center gap-3 mb-6 border-b border-gray-100 pb-4">
                    <button onClick={() => setModalType("pastFlats")} className="p-2 bg-[#F5F5F7] hover:bg-gray-200 rounded-full transition-colors active:scale-95">
                      <ChevronLeft className="w-5 h-5 text-[#1D1D1F]" />
                    </button>
                    <div>
                      <h3 className="text-xl font-bold text-[#1D1D1F]">{selectedPastFlat?.flatName}</h3>
                      <p className="text-xs text-[#86868B] font-medium">Archived Transactions</p>
                    </div>
                  </div>
                  
                  <div className="min-h-[200px]">
                    {isSubmitting ? (
                      <div className="flex flex-col items-center justify-center h-40 text-[#86868B]">
                        <Loader2 className="w-6 h-6 animate-spin mb-2 text-[#0071E3]" />
                        <span className="text-sm font-medium">Fetching history...</span>
                      </div>
                    ) : pastTransactions.length === 0 ? (
                      <div className="flex flex-col items-center justify-center h-40 text-center">
                        <Receipt className="w-10 h-10 text-gray-300 mb-3" />
                        <p className="text-[#86868B] font-medium text-sm">No recorded transactions found<br/>for this flat.</p>
                      </div>
                    ) : (
                      <div className="space-y-3">
                         {pastTransactions.map((txn, i) => (
                           <div key={i} className="flex justify-between items-center p-3 bg-gray-50 rounded-xl border border-gray-100">
                              <div>
                                <p className="font-bold text-sm text-[#1D1D1F]">{txn.description}</p>
                                <p className="text-xs text-gray-400">{new Date(txn.date).toLocaleDateString()}</p>
                              </div>
                              <p className="font-bold text-[#1D1D1F]">₹{txn.amount}</p>
                           </div>
                         ))}
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* LEAVE CONFIRM & TRANSFER ADMIN */}
              {modalType === "leaveConfirm" && (
                <div className="text-center py-2">
                  <div className="w-16 h-16 bg-[#FF3B30]/10 text-[#FF3B30] rounded-full flex items-center justify-center mx-auto mb-6"><UserMinus className="w-8 h-8"/></div>
                  <h3 className="text-2xl font-bold text-[#1D1D1F] mb-2">Leave Flat?</h3>
                  <p className="text-[#86868B] text-sm mb-8">Are you sure you want to leave <b>{flatData?.flatName}</b>? You will need a new invite code to rejoin later.</p>
                  <div className="flex gap-3">
                    <button onClick={closeModal} className="flex-1 bg-[#F5F5F7] hover:bg-gray-200 text-[#1D1D1F] py-3.5 rounded-xl font-bold transition-colors active:scale-95">Cancel</button>
                    <button onClick={() => executeLeaveFlat()} disabled={isSubmitting} className="flex-1 bg-[#FF3B30] hover:bg-red-600 text-white py-3.5 rounded-xl font-bold transition-colors active:scale-95 flex justify-center items-center gap-2">
                      {isSubmitting && <Loader2 className="w-4 h-4 animate-spin" />} Yes, Leave
                    </button>
                  </div>
                </div>
              )}
              
              {modalType === "transferAdmin" && (
                <div>
                  <h3 className="text-2xl font-bold text-red-600 mb-2">Action Required</h3>
                  <p className="text-gray-600 text-sm mb-6">You are the creator of this flat. You must assign admin rights to another flatmate before you can leave.</p>
                  <label className="block text-sm font-bold mb-2">Select new Admin:</label>
                  <select value={selectedNewAdmin} onChange={(e)=>setSelectedNewAdmin(e.target.value)} className="w-full bg-[#F5F5F7] px-4 py-3 rounded-xl outline-none mb-8 font-medium">
                    {otherMembers.map(m => (
                      <option key={m.uid} value={m.uid}>{m.name}</option>
                    ))}
                  </select>
                  <div className="flex gap-3">
                    <button onClick={closeModal} className="flex-1 bg-gray-100 py-3 rounded-xl font-bold">Cancel</button>
                    <button onClick={() => executeLeaveFlat(selectedNewAdmin)} disabled={isSubmitting} className="flex-1 bg-red-500 text-white py-3 rounded-xl font-bold">{isSubmitting ? "Processing..." : "Transfer & Leave"}</button>
                  </div>
                </div>
              )}

            </motion.div>
          </div>
        )}
      </AnimatePresence>

    </div>
  );
}