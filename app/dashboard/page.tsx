"use client";

import { useEffect, useState } from "react";
import { auth, db } from "../../lib/firebase";
import { doc, getDoc, setDoc, updateDoc, deleteDoc, arrayUnion, arrayRemove, collection, query, where, getDocs } from "firebase/firestore";
import { useRouter } from "next/navigation";
import { LogOut, Home, Plus, Users, Activity, X, Loader2, MapPin, LocateFixed, Menu, Settings, UserMinus, History, ChevronRight, ChevronLeft, Receipt, Banknote, QrCode, Upload, CheckCircle, Trash2, Edit2, Download, FileText, Search, Filter, Bell, ShieldAlert } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { BarChart, Bar, XAxis, Tooltip, ResponsiveContainer } from "recharts";

// Helper: File -> base64 string
const fileToBase64 = (file: File): Promise<string> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = (error) => reject(error);
  });
};

export default function Dashboard() {
  const [user, setUser] = useState<any>(null);
  const [userData, setUserData] = useState<any>(null);
  const [flatData, setFlatData] = useState<any>(null);
  const [flatMembers, setFlatMembers] = useState<any[]>([]); 
  const [flatTransactions, setFlatTransactions] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  
  // UI States
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [modalType, setModalType] = useState<"create" | "join" | "leaveConfirm" | "transferAdmin" | "pastFlats" | "editFlat" | "pastFlatHistory" | "addExpense" | "paymentSettings" | "initiatePayment" | "approvals" | "ledger" | null>(null);
  
  // Form States
  const [inputValue, setInputValue] = useState("");
  const [address, setAddress] = useState("");
  const [maxMates, setMaxMates] = useState("4");
  const [isFlatLocked, setIsFlatLocked] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");
  const [isFetchingLoc, setIsFetchingLoc] = useState(false);
  
  // Add/Edit Expense States
  const [expenseDesc, setExpenseDesc] = useState("");
  const [expenseAmt, setExpenseAmt] = useState("");
  const [splitType, setSplitType] = useState("all"); 
  const [splitAmong, setSplitAmong] = useState<string[]>([]); 
  const [editingTxnId, setEditingTxnId] = useState<string | null>(null);

  // Payment & Settlement States
  const [upiId, setUpiId] = useState("");
  const [qrFile, setQrFile] = useState<File | null>(null);
  const [settleData, setSettleData] = useState<any>(null);
  const [settleAmount, setSettleAmount] = useState("");
  const [proofFile, setProofFile] = useState<File | null>(null);

  // Transfer Admin & Past Flat States
  const [otherMembers, setOtherMembers] = useState<any[]>([]);
  const [selectedNewAdmin, setSelectedNewAdmin] = useState("");
  const [selectedPastFlat, setSelectedPastFlat] = useState<any>(null);
  const [pastTransactions, setPastTransactions] = useState<any[]>([]);

  // Advanced Ledger Filter States
  const [filterSearch, setFilterSearch] = useState("");
  const [filterDateFrom, setFilterDateFrom] = useState("");
  const [filterDateTo, setFilterDateTo] = useState("");
  const [filterPaidBy, setFilterPaidBy] = useState("all");

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

  // --- ADMIN CONTROL: REMOVE MEMBER ---
  const handleRemoveMember = async (memberId: string, memberName: string) => {
    if (!confirm(`Are you sure you want to kick ${memberName} out of the flat?`)) return;
    setIsLoading(true);
    try {
      await updateDoc(doc(db, "flats", userData.flatId), {
        members: arrayRemove(memberId)
      });
      await updateDoc(doc(db, "users", memberId), {
        flatId: null,
        pastFlats: arrayUnion({ flatId: userData.flatId, flatName: flatData?.flatName, leftAt: new Date().toISOString() })
      });
      await loadData(user);
    } catch(e) {
      console.error(e);
      alert("Failed to remove member.");
    } finally {
      setIsLoading(false);
    }
  };

  // --- NOTIFICATIONS: REQUEST PERMISSION ---
  const requestNotificationPermission = async () => {
    setIsMenuOpen(false);
    if (!("Notification" in window)) {
      alert("This browser does not support desktop notifications.");
      return;
    }
    try {
      const permission = await Notification.requestPermission();
      if (permission === "granted") {
        alert("Push Notifications enabled! You will now receive alerts for new expenses.");
      } else {
        alert("Notification permission denied. Please enable them in your browser settings.");
      }
    } catch (error) {
      console.error("Error requesting notification permission:", error);
    }
  };

  // --- CREATE FLAT ---
  const handleCreateFlat = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputValue || !address) return;
    setIsSubmitting(true);
    try {
      const flatId = Math.random().toString(36).substring(2, 8).toUpperCase();
      await setDoc(doc(db, "flats", flatId), {
        flatId, flatName: inputValue, address, maxMates: Number(maxMates), isLocked: false,
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
    setIsFlatLocked(flatData.isLocked || false);
    setIsMenuOpen(false);
    setModalType("editFlat");
  };

  const handleEditFlat = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputValue || !address) return;
    setIsSubmitting(true);
    try {
      await updateDoc(doc(db, "flats", userData.flatId), {
        flatName: inputValue, address, maxMates: Number(maxMates), isLocked: isFlatLocked
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

  // --- VIEW PAST FLAT HISTORY ---
  const handleViewPastFlat = async (pf: any) => {
    setSelectedPastFlat(pf);
    setModalType("pastFlatHistory");
    setIsSubmitting(true);
    try {
      const q = query(collection(db, "transactions"), where("flatId", "==", pf.flatId));
      const txnsSnap = await getDocs(q);
      setPastTransactions(txnsSnap.docs.map(d => d.data()));
    } catch (e) {
      console.error(e);
      setPastTransactions([]);
    } finally {
      setIsSubmitting(false);
    }
  };

  // --- DELETE & EDIT TRANSACTION LOGIC ---
  const handleDeleteTransaction = async (txnId: string) => {
    if (!confirm("Are you sure you want to delete this? This action cannot be undone.")) return;
    setIsLoading(true);
    try {
      await deleteDoc(doc(db, "transactions", txnId));
      await loadData(user);
    } catch (e) {
      console.error("Failed to delete transaction", e);
    } finally {
      setIsLoading(false);
    }
  };

  const openEditTransaction = (txn: any) => {
    setExpenseDesc(txn.description);
    setExpenseAmt(txn.amount.toString());
    if (txn.splitAmong?.length === flatMembers.length) {
      setSplitType("all");
      setSplitAmong([]);
    } else {
      setSplitType("custom");
      setSplitAmong(txn.splitAmong || []);
    }
    setEditingTxnId(txn.transactionId);
    setModalType("addExpense");
  };

  // --- ADD / UPDATE EXPENSE LOGIC ---
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
      if (editingTxnId) {
        await updateDoc(doc(db, "transactions", editingTxnId), {
          description: expenseDesc,
          amount: Number(expenseAmt),
          splitAmong: finalSplit,
        });
      } else {
        const txnId = "txn_" + Date.now(); 
        await setDoc(doc(db, "transactions", txnId), {
          transactionId: txnId,
          flatId: userData.flatId,
          description: expenseDesc,
          amount: Number(expenseAmt),
          paidBy: user.uid,
          splitAmong: finalSplit, 
          date: new Date().toISOString(),
          type: "expense"
        });
      }
      await loadData(user); 
      closeModal();
    } catch (error) {
      setErrorMsg("Error saving expense.");
      console.error(error);
    } finally {
      setIsSubmitting(false);
    }
  };

  // --- LEDGER FILTERING LOGIC ---
  const sortedTransactions = [...flatTransactions].sort((a,b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  
  const filteredTransactions = sortedTransactions.filter(txn => {
    const matchSearch = filterSearch ? (txn.description?.toLowerCase().includes(filterSearch.toLowerCase()) || false) : true;
    
    let matchDateFrom = true;
    if (filterDateFrom) {
      matchDateFrom = new Date(txn.date) >= new Date(filterDateFrom);
    }
    
    let matchDateTo = true;
    if (filterDateTo) {
      const toDate = new Date(filterDateTo);
      toDate.setHours(23, 59, 59, 999);
      matchDateTo = new Date(txn.date) <= toDate;
    }
    
    let matchPaidBy = true;
    if (filterPaidBy !== "all") {
       const actualPaidBy = txn.type === 'settlement' ? txn.from : txn.paidBy;
       matchPaidBy = actualPaidBy === filterPaidBy;
    }

    return matchSearch && matchDateFrom && matchDateTo && matchPaidBy;
  });

  // --- DOWNLOAD REPORT (CSV) ---
  const handleDownloadReport = () => {
    const headers = ["Date", "Description", "Type", "Amount (INR)", "Paid By / Sender", "To / Split", "Status"];
    
    const rows = filteredTransactions.map(txn => {
      const date = new Date(txn.date).toLocaleDateString();
      const desc = txn.type === 'settlement' ? 'Settlement' : txn.description;
      const type = txn.type;
      const amt = txn.amount;
      const from = flatMembers.find(m => m.uid === (txn.type === 'settlement' ? txn.from : txn.paidBy))?.name || 'Unknown';
      const to = txn.type === 'settlement' 
          ? (flatMembers.find(m => m.uid === txn.to)?.name || 'Unknown') 
          : (txn.splitAmong?.length === flatMembers.length ? "Everyone" : `${txn.splitAmong?.length} members`);
      const status = txn.status || 'Completed';
      
      return `"${date}","${desc}","${type}","${amt}","${from}","${to}","${status}"`;
    });

    const csvContent = [headers.join(","), ...rows].join("\n");
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", `${flatData?.flatName || "Flat"}_Filtered_Ledger.csv`);
    link.style.visibility = "hidden";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // --- FIX: TRUE DIRECT PDF DOWNLOAD (No Print Dialog, Mobile Safe) ---
  const handleDownloadPDF = async () => {
    const btnText = document.getElementById("pdf-btn-text");
    if (btnText) btnText.innerText = "Wait...";

    // Dynamically load html2pdf.js (No npm install needed, prevents Next.js SSR errors)
    if (!(window as any).html2pdf) {
      const script = document.createElement('script');
      script.src = "https://cdnjs.cloudflare.com/ajax/libs/html2pdf.js/0.10.1/html2pdf.bundle.min.js";
      document.body.appendChild(script);
      await new Promise((resolve) => { script.onload = resolve; });
    }

    const totalVolume = filteredTransactions.reduce((acc, curr) => acc + curr.amount, 0);

    const printContent = `
      <div style="font-family: Helvetica, Arial, sans-serif; color: #1D1D1F; padding: 30px; background: white;">
        <div style="text-align: center; border-bottom: 2px solid #F5F5F7; padding-bottom: 20px; margin-bottom: 30px;">
          <h1 style="margin: 0; font-size: 32px; color: #0071E3;">${flatData?.flatName || 'Flatmate Ledger'}</h1>
          <p style="margin: 5px 0 0 0; color: #86868B; font-size: 14px;">Official Transaction Ledger • Generated on ${new Date().toLocaleDateString()}</p>
        </div>
        
        <div style="display: flex; justify-content: space-between; background: #F5F5F7; padding: 20px; border-radius: 12px; margin-bottom: 30px;">
          <div style="text-align: center; width: 48%;">
            <h4 style="margin: 0 0 5px 0; font-size: 12px; color: #86868B; text-transform: uppercase;">Filtered Records</h4>
            <p style="margin: 0; font-size: 24px; font-weight: 700; color: #1D1D1F;">${filteredTransactions.length}</p>
          </div>
          <div style="text-align: center; width: 48%;">
            <h4 style="margin: 0 0 5px 0; font-size: 12px; color: #86868B; text-transform: uppercase;">Total Volume</h4>
            <p style="margin: 0; font-size: 24px; font-weight: 700; color: #1D1D1F;">₹${totalVolume.toLocaleString()}</p>
          </div>
        </div>

        <table style="width: 100%; border-collapse: collapse; margin-top: 10px;">
          <thead>
            <tr>
              <th style="padding: 12px; text-align: left; border-bottom: 2px solid #E5E5EA; background-color: #F5F5F7; font-size: 12px; color: #86868B; text-transform: uppercase;">Date</th>
              <th style="padding: 12px; text-align: left; border-bottom: 2px solid #E5E5EA; background-color: #F5F5F7; font-size: 12px; color: #86868B; text-transform: uppercase;">Description</th>
              <th style="padding: 12px; text-align: left; border-bottom: 2px solid #E5E5EA; background-color: #F5F5F7; font-size: 12px; color: #86868B; text-transform: uppercase;">Paid By</th>
              <th style="padding: 12px; text-align: left; border-bottom: 2px solid #E5E5EA; background-color: #F5F5F7; font-size: 12px; color: #86868B; text-transform: uppercase;">Amount</th>
              <th style="padding: 12px; text-align: left; border-bottom: 2px solid #E5E5EA; background-color: #F5F5F7; font-size: 12px; color: #86868B; text-transform: uppercase;">Status</th>
            </tr>
          </thead>
          <tbody>
            ${filteredTransactions.map(txn => {
              const date = new Date(txn.date).toLocaleDateString();
              const desc = txn.type === 'settlement' ? 'Payment Settlement' : txn.description;
              const fromUid = txn.type === 'settlement' ? txn.from : txn.paidBy;
              const fromName = flatMembers.find(m => m.uid === fromUid)?.name || 'Unknown';
              const amtColor = txn.type === 'settlement' ? '#34C759' : '#1D1D1F';
              const statusText = (txn.type === 'settlement' && txn.status === 'pending') ? 'PENDING' : 'Completed';
              const statusColor = (txn.type === 'settlement' && txn.status === 'pending') ? '#9A3412' : '#86868B';
              
              return `
                <tr>
                  <td style="padding: 12px; border-bottom: 1px solid #E5E5EA; font-size: 13px;">${date}</td>
                  <td style="padding: 12px; border-bottom: 1px solid #E5E5EA; font-size: 13px;">${desc}</td>
                  <td style="padding: 12px; border-bottom: 1px solid #E5E5EA; font-size: 13px;">${fromName}</td>
                  <td style="padding: 12px; border-bottom: 1px solid #E5E5EA; font-size: 13px; font-weight: bold; color: ${amtColor};">₹${txn.amount.toLocaleString()}</td>
                  <td style="padding: 12px; border-bottom: 1px solid #E5E5EA; font-size: 11px; font-weight: bold; color: ${statusColor};">${statusText}</td>
                </tr>
              `;
            }).join('')}
          </tbody>
        </table>
      </div>
    `;

    const container = document.createElement('div');
    container.innerHTML = printContent;

    const opt = {
      margin:       0.2,
      filename:     `${flatData?.flatName || 'Flat'}_Filtered_Ledger.pdf`,
      image:        { type: 'jpeg', quality: 0.98 },
      html2canvas:  { scale: 2, useCORS: true },
      jsPDF:        { unit: 'in', format: 'letter', orientation: 'portrait' }
    };

    (window as any).html2pdf().set(opt).from(container).save().then(() => {
      if (btnText) btnText.innerText = "PDF";
    });
  };

  // --- SAVE PAYMENT SETTINGS (base64) ---
  const handleSavePaymentSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    setErrorMsg("");
    try {
      let qrCodeUrl = userData?.qrCodeUrl || "";
      if (qrFile) {
        qrCodeUrl = await fileToBase64(qrFile);
      }
      await updateDoc(doc(db, "users", user.uid), { upiId, qrCodeUrl });
      await loadData(user);
      closeModal();
    } catch (error) {
      console.error(error);
      setErrorMsg("Error saving details. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  };

  // --- INITIATE PAYMENT (OPEN MODAL) ---
  const openSettleModal = async (debt: any) => {
    setIsMenuOpen(false);
    setIsLoading(true);
    try {
      const uSnap = await getDoc(doc(db, "users", debt.to));
      if (uSnap.exists()) {
        setSettleData({ toUser: uSnap.data(), recommendedAmount: debt.amount });
        setSettleAmount(Math.round(debt.amount).toString());
        setModalType("initiatePayment");
      }
    } catch (error) {
      console.error(error);
    } finally {
      setIsLoading(false);
    }
  };

  // --- SUBMIT PAYMENT PROOF (base64) ---
  const handleSubmitPayment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!proofFile || !settleAmount) return setErrorMsg("Proof and amount required.");
    setIsSubmitting(true);
    setErrorMsg("");
    try {
      const proofBase64 = await fileToBase64(proofFile);

      const txnId = "stl_" + Date.now();
      await setDoc(doc(db, "transactions", txnId), {
        transactionId: txnId,
        flatId: userData.flatId,
        amount: Number(settleAmount),
        from: user.uid,
        to: settleData.toUser.uid,
        proofUrl: proofBase64,
        date: new Date().toISOString(),
        type: "settlement",
        status: "pending"
      });
      await loadData(user);
      closeModal();
    } catch (error) {
      console.error(error);
      setErrorMsg("Error submitting payment. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  };

  // --- APPROVE PAYMENT ---
  const handleApprovePayment = async (txnId: string) => {
    setIsSubmitting(true);
    try {
      await updateDoc(doc(db, "transactions", txnId), { status: "approved" });
      await loadData(user);
    } catch (error) {
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
      if (txn.type === "expense") {
        const splitCount = txn.splitAmong?.length || 1;
        const splitAmount = txn.amount / splitCount;
        balances[txn.paidBy] = (balances[txn.paidBy] || 0) + txn.amount;
        txn.splitAmong?.forEach((uid: string) => {
          balances[uid] = (balances[uid] || 0) - splitAmount;
        });
      } else if (txn.type === "settlement" && txn.status === "approved") {
        balances[txn.from] = (balances[txn.from] || 0) + txn.amount;
        balances[txn.to] = (balances[txn.to] || 0) - txn.amount;
      }
    });
    return balances;
  };

  // --- CALCULATE DETAILED DEBTS (WHO OWES WHOM) ---
  const calculateDetailedDebts = (balances: any) => {
    let debtors: any[] = [];
    let creditors: any[] = [];

    for (const uid in balances) {
      if (balances[uid] < -0.01) debtors.push({ uid, amount: Math.abs(balances[uid]) });
      if (balances[uid] > 0.01) creditors.push({ uid, amount: balances[uid] });
    }

    let debts = [];
    let d = 0; 
    let c = 0; 

    while (d < debtors.length && c < creditors.length) {
      let debtor = debtors[d];
      let creditor = creditors[c];
      let settleAmount = Math.min(debtor.amount, creditor.amount);

      debts.push({
        from: debtor.uid,
        to: creditor.uid,
        amount: settleAmount
      });

      debtor.amount -= settleAmount;
      creditor.amount -= settleAmount;

      if (debtor.amount < 0.01) d++;
      if (creditor.amount < 0.01) c++;
    }
    return debts;
  };

  // --- GET CHART DATA (LAST 7 DAYS TREND) ---
  const getChartData = () => {
    const dataMap: { [key: string]: number } = {};
    const last7Days = [...Array(7)].map((_, i) => {
      const d = new Date();
      d.setDate(d.getDate() - i);
      return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
    }).reverse();

    last7Days.forEach(date => { dataMap[date] = 0; });

    flatTransactions.forEach(txn => {
      if (txn.type === 'expense') {
        const dateStr = new Date(txn.date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
        if (dataMap[dateStr] !== undefined) {
          dataMap[dateStr] += txn.amount;
        }
      }
    });
    return last7Days.map(date => ({ date, amount: dataMap[date] }));
  };

  const closeModal = () => {
    setModalType(null); setErrorMsg(""); setInputValue(""); setAddress(""); setMaxMates("4");
    setExpenseDesc(""); setExpenseAmt(""); setSplitType("all"); setSplitAmong([]);
    setUpiId(""); setQrFile(null); setSettleData(null); setSettleAmount(""); setProofFile(null);
    setEditingTxnId(null);
    setFilterSearch(""); setFilterDateFrom(""); setFilterDateTo(""); setFilterPaidBy("all");
    setIsFlatLocked(false);
  };

  if (isLoading) return <div className="min-h-screen bg-[#F5F5F7] flex items-center justify-center"><Loader2 className="w-8 h-8 text-[#0071E3] animate-spin" /></div>;

  const getInitials = (name: string) => name ? name.charAt(0).toUpperCase() : "U";
  
  const balances = calculateBalances();
  const myBalance = balances[user?.uid] || 0;
  const detailedDebts = calculateDetailedDebts(balances);
  const pendingApprovals = flatTransactions.filter(t => t.type === "settlement" && t.status === "pending" && t.to === user.uid);
  const chartData = getChartData();
  const isLocked = flatData?.isLocked || false;
  
  // REUSABLE TRANSACTION ITEM COMPONENT
  const TransactionItem = ({ txn }: { txn: any }) => {
    // Check if transaction was created within the last 24 hours
    const isWithin24Hours = (Date.now() - new Date(txn.date).getTime()) < 24 * 60 * 60 * 1000;

    return (
      <div className="flex justify-between items-center p-3 bg-white rounded-xl border border-gray-100 shadow-sm group">
        <div className="flex-1">
          <p className="font-bold text-sm text-[#1D1D1F]">
            {txn.type === "settlement" ? "Payment Settlement" : txn.description}
            {txn.type === "settlement" && txn.status === "pending" && <span className="ml-2 text-[10px] bg-yellow-100 text-yellow-700 px-2 py-0.5 rounded-full">Pending</span>}
          </p>
          <p className="text-xs text-gray-400 mt-0.5">
            {new Date(txn.date).toLocaleDateString()} • {txn.type === "settlement" ? `From ${txn.from === user.uid ? "You" : flatMembers.find(m=>m.uid===txn.from)?.name?.split(" ")[0]}` : `Paid by ${txn.paidBy === user.uid ? "You" : flatMembers.find(m => m.uid === txn.paidBy)?.name?.split(" ")[0]}`}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <p className={`font-bold ${txn.type === "settlement" ? "text-green-600" : "text-[#1D1D1F]"}`}>₹{txn.amount}</p>
          
          {/* EDIT & DELETE ACTIONS (Disabled if Locked, and only allowed within 24 hours) */}
          {!isLocked && isWithin24Hours && txn.type === "expense" && txn.paidBy === user.uid && (
            <div className="flex items-center gap-1 opacity-40 hover:opacity-100 transition-opacity">
              <button onClick={() => openEditTransaction(txn)} className="p-1.5 text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"><Edit2 className="w-3.5 h-3.5"/></button>
              <button onClick={() => handleDeleteTransaction(txn.transactionId)} className="p-1.5 text-red-600 hover:bg-red-50 rounded-lg transition-colors"><Trash2 className="w-3.5 h-3.5"/></button>
            </div>
          )}
          {!isLocked && isWithin24Hours && txn.type === "settlement" && txn.status === "pending" && txn.from === user.uid && (
            <div className="flex items-center gap-1 opacity-40 hover:opacity-100 transition-opacity">
              <button onClick={() => handleDeleteTransaction(txn.transactionId)} className="p-1.5 text-red-600 hover:bg-red-50 rounded-lg transition-colors"><Trash2 className="w-3.5 h-3.5"/></button>
            </div>
          )}
        </div>
      </div>
    );
  };

  return (
    <div className="min-h-screen bg-[#F5F5F7] text-[#1D1D1F] font-sans pb-10 overflow-x-hidden">
      
      {/* --- NAVBAR --- */}
      <nav className="bg-white/80 backdrop-blur-md border-b border-gray-200 px-4 sm:px-6 py-4 sticky top-0 z-40">
        <div className="max-w-5xl mx-auto flex justify-between items-center">
          <h1 className="text-[26px] font-extrabold tracking-tight text-[#1D1D1F] lowercase">flatmates.</h1>
          <button onClick={() => setIsMenuOpen(true)} className="relative p-2 hover:bg-gray-100 rounded-full transition-colors active:scale-95">
            <Menu className="w-6 h-6 text-[#1D1D1F]" />
            {pendingApprovals.length > 0 && (
              <span className="absolute top-1 right-1 w-3 h-3 bg-red-500 rounded-full border-2 border-white"></span>
            )}
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
              <div className="space-y-2 flex-grow overflow-y-auto">
                {userData?.flatId && (
                  <>
                    <button onClick={() => { setIsMenuOpen(false); setModalType("approvals"); }} className="w-full flex items-center justify-between p-3 hover:bg-[#F5F5F7] rounded-xl font-medium transition-colors text-left active:scale-95">
                      <div className="flex items-center gap-3"><CheckCircle className="w-5 h-5 text-green-600" /> Pending Approvals</div>
                      {pendingApprovals.length > 0 && <span className="bg-red-500 text-white text-xs font-bold px-2 py-0.5 rounded-full">{pendingApprovals.length}</span>}
                    </button>
                    <button onClick={() => { setUpiId(userData?.upiId || ""); setIsMenuOpen(false); setModalType("paymentSettings"); }} className="w-full flex items-center gap-3 p-3 hover:bg-[#F5F5F7] rounded-xl font-medium transition-colors text-left active:scale-95">
                      <QrCode className="w-5 h-5 text-[#0071E3]" /> Payment Settings
                    </button>
                    <button onClick={requestNotificationPermission} className="w-full flex items-center gap-3 p-3 hover:bg-[#F5F5F7] rounded-xl font-medium transition-colors text-left active:scale-95">
                      <Bell className="w-5 h-5 text-yellow-500" /> Enable Notifications
                    </button>
                    {flatData?.createdBy === user.uid && (
                      <button onClick={openEditModal} className="w-full flex items-center gap-3 p-3 hover:bg-[#F5F5F7] rounded-xl font-medium transition-colors text-left active:scale-95">
                        <Settings className="w-5 h-5 text-gray-500" /> Flat Settings & Admin
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
            <h2 className="text-2xl sm:text-3xl font-bold text-[#1D1D1F] tracking-tight">Hello, {user?.displayName?.split(" ")[0] || "User"}</h2>
            <p className="text-[#86868B] text-sm sm:text-base mt-1">Manage your shared expenses simply.</p>
          </div>
          {user?.photoURL ? (
            <img src={user.photoURL} alt="Profile" className="w-12 h-12 rounded-full shadow-sm bg-white border border-gray-200 object-cover" onError={(e) => (e.currentTarget.style.display = 'none')} />
          ) : (
             <div className="w-12 h-12 rounded-full bg-[#0071E3]/10 text-[#0071E3] flex items-center justify-center font-bold text-lg shadow-sm">
               {getInitials(user?.displayName)}
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
                   <h3 className="font-bold text-2xl flex items-center gap-2">
                     {flatData?.flatName} 
                     {isLocked && (
                       <span title="Flat is Locked">
                         <ShieldAlert className="w-5 h-5 text-red-500" />
                       </span>
                     )}
                   </h3>
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
                      <div key={i} className="flex items-center gap-2 bg-[#F5F5F7] pr-3 pl-1 py-1 rounded-full border border-gray-100 group relative">
                        {member.photoURL ? (
                          <img src={member.photoURL} alt={member.name} className="w-7 h-7 rounded-full object-cover" onError={(e) => (e.currentTarget.style.display = 'none')} />
                        ) : (
                          <div className="w-7 h-7 rounded-full bg-white text-[#1D1D1F] flex items-center justify-center text-xs font-bold shadow-sm">
                            {getInitials(member.name)}
                          </div>
                        )}
                        <span className="text-sm font-medium text-[#1D1D1F]">{member.name?.split(" ")[0]}</span>
                        
                        {/* ADMIN KICK BUTTON */}
                        {flatData?.createdBy === user?.uid && member.uid !== user?.uid && (
                          <button onClick={() => handleRemoveMember(member.uid, member.name)} className="hidden group-hover:block ml-1 text-red-500 hover:text-red-700 transition-colors" title="Remove Member">
                            <X className="w-4 h-4" />
                          </button>
                        )}
                      </div>
                    ))}
                 </div>
               </div>

               {/* RECENT TRANSACTIONS (Top 4 only) */}
               <div className="flex-grow flex flex-col bg-gray-50 rounded-2xl border border-dashed border-gray-200 p-4">
                 {sortedTransactions.length === 0 ? (
                    <div className="flex flex-col items-center justify-center h-full text-[#86868B] py-6">
                      <Receipt className="w-8 h-8 text-gray-300 mb-2" />
                      <p className="text-sm font-medium">No activity yet.</p>
                    </div>
                 ) : (
                    <div className="space-y-3">
                      {sortedTransactions.slice(0, 4).map((txn, i) => (
                        <TransactionItem key={txn.transactionId || i} txn={txn} />
                      ))}
                      
                      {/* VIEW ALL / FULL LEDGER BUTTON */}
                      {sortedTransactions.length > 4 && (
                        <button onClick={() => setModalType("ledger")} className="w-full text-center text-sm font-bold text-[#0071E3] py-2 hover:bg-blue-50 rounded-xl transition-colors">
                          View Full Ledger ({sortedTransactions.length} entries)
                        </button>
                      )}
                    </div>
                 )}
               </div>
               
               {/* ADD EXPENSE BUTTON (Disabled if Locked) */}
               <button 
                 onClick={() => { if(!isLocked) { setEditingTxnId(null); setSplitType("all"); setSplitAmong([]); setModalType("addExpense"); } }} 
                 disabled={isLocked}
                 className={`mt-6 w-full py-3.5 rounded-xl font-semibold flex justify-center items-center gap-2 transition-all shadow-sm ${isLocked ? 'bg-gray-300 text-gray-500 cursor-not-allowed' : 'bg-[#0071E3] hover:bg-[#0077ED] text-white active:scale-95'}`}
               >
                 {isLocked ? <ShieldAlert className="w-5 h-5"/> : <Plus className="w-5 h-5"/>} 
                 {isLocked ? "Flat is Locked by Admin" : "Add New Expense"}
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

              {/* EXACT DETAILED SETTLEMENTS */}
              <div className="mt-8 space-y-3 border-t border-gray-100 pt-6">
                 <p className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-3">How to settle up</p>
                 
                 {detailedDebts.length === 0 ? (
                    <p className="text-sm text-[#86868B] italic">No pending settlements.</p>
                 ) : (
                    detailedDebts.map((debt, idx) => {
                      const fromName = debt.from === user.uid ? "You" : flatMembers.find(m => m.uid === debt.from)?.name?.split(" ")[0];
                      const toName = debt.to === user.uid ? "You" : flatMembers.find(m => m.uid === debt.to)?.name?.split(" ")[0];
                      
                      return (
                        <div key={idx} className="flex justify-between items-center text-sm p-3 bg-gray-50 rounded-xl border border-gray-100">
                          <span className="font-medium text-[#1D1D1F] flex-1">
                            <span className={debt.from === user.uid ? "text-red-600 font-bold" : ""}>{fromName}</span> 
                            <span className="text-gray-400 font-normal mx-1.5">owes</span> 
                            <span className={debt.to === user.uid ? "text-green-600 font-bold" : ""}>{toName}</span>
                          </span>
                          <span className="font-bold text-[#1D1D1F] mr-3">₹{Math.round(debt.amount)}</span>
                          
                          {/* SHOW PAY BUTTON IF USER IS THE DEBTOR */}
                          {debt.from === user.uid && !isLocked && (
                            <button onClick={() => openSettleModal(debt)} className="bg-black text-white text-xs px-3 py-1.5 rounded-lg font-bold hover:bg-gray-800 active:scale-95 transition-all">Pay</button>
                          )}
                        </div>
                      )
                    })
                 )}
                 {flatMembers.length <= 1 && (
                    <p className="text-sm text-gray-400 italic text-center py-2">Add members to see split</p>
                 )}
              </div>

              {/* EXPENSE TRENDS CHART */}
              <div className="mt-8 pt-6 border-t border-gray-100">
                 <p className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-4">Last 7 Days Trend</p>
                 {chartData.some(d => d.amount > 0) ? (
                   <div className="h-40 w-full">
                     <ResponsiveContainer width="100%" height="100%">
                       <BarChart data={chartData}>
                         <XAxis dataKey="date" tick={{fontSize: 10, fill: '#86868B'}} axisLine={false} tickLine={false} />
                         <Tooltip cursor={{fill: '#F5F5F7'}} contentStyle={{borderRadius: '12px', border: '1px solid #E5E5EA', boxShadow: '0 4px 12px rgba(0,0,0,0.05)'}} />
                         <Bar dataKey="amount" fill="#0071E3" radius={[4, 4, 0, 0]} />
                       </BarChart>
                     </ResponsiveContainer>
                   </div>
                 ) : (
                   <p className="text-sm text-[#86868B] italic">No recent expenses to plot.</p>
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
            
            <motion.div initial={{ opacity: 0, scale: 0.95, y: 10 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.95, y: 10 }} className={`bg-white w-full ${modalType === 'ledger' ? 'max-w-2xl' : 'max-w-md'} rounded-[24px] shadow-2xl relative z-10 p-6 sm:p-8 overflow-hidden max-h-[90vh] flex flex-col`}>
              {modalType !== "pastFlatHistory" && modalType !== "initiatePayment" && modalType !== "ledger" && (
                <button onClick={closeModal} className="absolute top-6 right-6 p-2 bg-[#F5F5F7] hover:bg-gray-200 rounded-full transition-colors active:scale-95"><X className="w-5 h-5 text-[#86868B]" /></button>
              )}

              {/* FULL LEDGER & ADVANCED FILTERS MODAL */}
              {modalType === "ledger" && (
                <div className="flex flex-col h-full max-h-[75vh]">
                  <div className="flex justify-between items-center mb-4">
                    <h3 className="text-2xl font-bold text-[#1D1D1F]">Full Ledger</h3>
                    <div className="flex gap-2">
                       <button onClick={handleDownloadReport} title="Download CSV Data" className="text-[#0071E3] bg-[#0071E3]/10 hover:bg-[#0071E3]/20 px-3 py-1.5 rounded-lg font-bold text-sm flex items-center gap-1.5 transition-colors"><Download className="w-4 h-4"/> CSV</button>
                       <button onClick={handleDownloadPDF} title="Download PDF Report" className="text-red-600 bg-red-100 hover:bg-red-200 px-3 py-1.5 rounded-lg font-bold text-sm flex items-center gap-1.5 transition-colors"><FileText className="w-4 h-4"/> <span id="pdf-btn-text">PDF</span></button>
                       <button onClick={closeModal} className="p-1.5 bg-[#F5F5F7] hover:bg-gray-200 rounded-full transition-colors"><X className="w-5 h-5 text-[#86868B]" /></button>
                    </div>
                  </div>
                  
                  {/* FILTERS BAR */}
                  <div className="bg-[#F5F5F7] p-4 rounded-xl mb-4 space-y-3 shrink-0">
                    <div className="flex gap-3 items-center">
                      <div className="relative flex-1">
                        <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"/>
                        <input type="text" placeholder="Search description..." value={filterSearch} onChange={e=>setFilterSearch(e.target.value)} className="w-full pl-9 pr-3 py-2 bg-white border border-transparent focus:border-[#0071E3] rounded-lg text-sm outline-none transition-colors" />
                      </div>
                      <select value={filterPaidBy} onChange={e=>setFilterPaidBy(e.target.value)} className="bg-white border border-transparent focus:border-[#0071E3] rounded-lg px-3 py-2 text-sm outline-none cursor-pointer transition-colors">
                        <option value="all">All Members</option>
                        {flatMembers.map(m => <option key={m.uid} value={m.uid}>{m.uid === user.uid ? "You" : m.name?.split(" ")[0]}</option>)}
                      </select>
                    </div>
                    <div className="flex gap-3 items-center">
                      <div className="flex-1 flex items-center gap-2">
                        <span className="text-xs text-gray-500 font-bold w-10">FROM</span>
                        <input type="date" value={filterDateFrom} onChange={e=>setFilterDateFrom(e.target.value)} className="w-full bg-white border border-transparent focus:border-[#0071E3] rounded-lg px-3 py-2 text-sm outline-none" />
                      </div>
                      <div className="flex-1 flex items-center gap-2">
                        <span className="text-xs text-gray-500 font-bold w-10">TO</span>
                        <input type="date" value={filterDateTo} onChange={e=>setFilterDateTo(e.target.value)} className="w-full bg-white border border-transparent focus:border-[#0071E3] rounded-lg px-3 py-2 text-sm outline-none" />
                      </div>
                    </div>
                    {(filterSearch || filterDateFrom || filterDateTo || filterPaidBy !== "all") && (
                      <div className="text-right">
                        <button onClick={()=>{setFilterSearch(""); setFilterDateFrom(""); setFilterDateTo(""); setFilterPaidBy("all");}} className="text-xs text-red-500 font-bold hover:underline transition-all">Clear Filters</button>
                      </div>
                    )}
                  </div>

                  <div className="flex-grow overflow-y-auto space-y-3 pr-2 custom-scrollbar">
                     {filteredTransactions.length === 0 ? (
                       <p className="text-center text-gray-500 py-6 text-sm font-medium">No transactions match your filters.</p>
                     ) : (
                       filteredTransactions.map((txn, i) => (
                         <TransactionItem key={txn.transactionId || i} txn={txn} />
                       ))
                     )}
                  </div>
                </div>
              )}

              {/* PAYMENT SETTINGS MODAL */}
              {modalType === "paymentSettings" && (
                <form onSubmit={handleSavePaymentSettings} className="overflow-y-auto pr-2">
                  <div className="mb-6">
                    <div className="w-12 h-12 bg-[#0071E3]/10 rounded-2xl flex items-center justify-center mb-4">
                      <QrCode className="w-6 h-6 text-[#0071E3]" />
                    </div>
                    <h3 className="text-2xl font-bold text-[#1D1D1F]">Payment Settings</h3>
                    <p className="text-sm text-[#86868B] mt-1">So your flatmates can pay you.</p>
                  </div>
                  {errorMsg && <p className="bg-red-50 text-red-600 p-3 rounded-xl text-sm font-medium mb-4 border border-red-100">{errorMsg}</p>}
                  
                  <div className="space-y-4 mb-8">
                    <div>
                      <label className="block text-sm font-semibold text-[#86868B] mb-2 ml-1">Your UPI ID</label>
                      <input type="text" value={upiId} onChange={(e)=>setUpiId(e.target.value)} placeholder="e.g., mobilenumber@upi" className="w-full bg-[#F5F5F7] text-[#1D1D1F] px-4 py-3.5 rounded-xl text-base outline-none border border-transparent focus:border-[#0071E3] focus:bg-white transition-all" />
                    </div>
                    <div>
                      <label className="block text-sm font-semibold text-[#86868B] mb-2 ml-1">Upload QR Code (Optional)</label>
                      <label className="w-full flex items-center justify-center gap-2 bg-[#F5F5F7] hover:bg-gray-200 text-[#1D1D1F] px-4 py-3.5 rounded-xl text-sm font-semibold cursor-pointer transition-colors border border-dashed border-gray-300">
                        <Upload className="w-4 h-4" /> {qrFile ? qrFile.name : "Select QR Image"}
                        <input type="file" accept="image/*" className="hidden" onChange={(e) => setQrFile(e.target.files?.[0] || null)} />
                      </label>
                      {userData?.qrCodeUrl && !qrFile && <p className="text-xs text-green-600 mt-2 font-medium ml-1">✓ You already have a QR code saved.</p>}
                    </div>
                  </div>
                  <button type="submit" disabled={isSubmitting} className="w-full bg-[#0071E3] hover:bg-[#0077ED] disabled:opacity-50 text-white py-3.5 rounded-xl font-semibold flex items-center justify-center gap-2 transition-all active:scale-95 shadow-sm">
                    {isSubmitting ? <><Loader2 className="w-5 h-5 animate-spin" /> Saving...</> : "Save Details"}
                  </button>
                </form>
              )}

              {/* INITIATE PAYMENT MODAL */}
              {modalType === "initiatePayment" && settleData && (
                <form onSubmit={handleSubmitPayment} className="overflow-y-auto pr-2">
                  <div className="flex justify-between items-center mb-6">
                    <h3 className="text-xl font-bold text-[#1D1D1F]">Pay {settleData.toUser.name?.split(" ")[0]}</h3>
                    <button type="button" onClick={closeModal} className="p-2 bg-[#F5F5F7] hover:bg-gray-200 rounded-full transition-colors"><X className="w-5 h-5 text-[#86868B]" /></button>
                  </div>
                  {errorMsg && <p className="bg-red-50 text-red-600 p-3 rounded-xl text-sm font-medium mb-4 border border-red-100">{errorMsg}</p>}
                  
                  <div className="bg-gray-50 border border-gray-200 p-4 rounded-2xl mb-6 text-center">
                    <p className="text-sm font-semibold text-gray-500 mb-1">UPI ID</p>
                    <p className="font-bold text-[#1D1D1F] select-all">{settleData.toUser.upiId || "No UPI ID added by user"}</p>
                    {settleData.toUser.qrCodeUrl && (
                       <img src={settleData.toUser.qrCodeUrl} alt="QR Code" className="w-40 h-40 mx-auto mt-4 rounded-xl shadow-sm border border-gray-200" />
                    )}
                  </div>

                  <div className="space-y-4 mb-8">
                    <div>
                      <label className="block text-sm font-semibold text-[#86868B] mb-2 ml-1">Paying Amount (₹)</label>
                      <input type="number" required min="1" value={settleAmount} onChange={(e)=>setSettleAmount(e.target.value)} className="w-full bg-[#F5F5F7] text-[#1D1D1F] px-4 py-3.5 rounded-xl text-2xl font-bold outline-none border border-transparent focus:border-[#34C759] focus:bg-white transition-all" />
                    </div>
                    <div>
                      <label className="block text-sm font-semibold text-[#86868B] mb-2 ml-1">Upload Payment Screenshot</label>
                      <label className="w-full flex items-center justify-center gap-2 bg-[#F5F5F7] hover:bg-gray-200 text-[#1D1D1F] px-4 py-3.5 rounded-xl text-sm font-semibold cursor-pointer transition-colors border border-dashed border-gray-300">
                        <Upload className="w-4 h-4" /> {proofFile ? proofFile.name : "Select Screenshot"}
                        <input type="file" required accept="image/*" className="hidden" onChange={(e) => setProofFile(e.target.files?.[0] || null)} />
                      </label>
                      {proofFile && <p className="text-xs text-green-600 mt-2 font-medium ml-1">✓ {proofFile.name} selected</p>}
                    </div>
                  </div>
                  <button type="submit" disabled={isSubmitting || !proofFile} className="w-full bg-[#34C759] hover:bg-[#2EAF4E] disabled:opacity-50 text-white py-3.5 rounded-xl font-semibold flex items-center justify-center gap-2 transition-all active:scale-95 shadow-sm">
                    {isSubmitting ? <><Loader2 className="w-5 h-5 animate-spin" /> Submitting...</> : "Submit for Approval"}
                  </button>
                </form>
              )}

              {/* PENDING APPROVALS MODAL */}
              {modalType === "approvals" && (
                <div className="overflow-y-auto pr-2">
                  <div className="mb-6">
                    <h3 className="text-xl font-bold text-[#1D1D1F]">Pending Approvals</h3>
                    <p className="text-sm text-[#86868B] mt-1">Confirm payments sent to you.</p>
                  </div>
                  {pendingApprovals.length === 0 ? (
                    <div className="text-center py-8 text-gray-500 font-medium">No pending payments.</div>
                  ) : (
                    <div className="space-y-4">
                      {pendingApprovals.map(txn => (
                        <div key={txn.transactionId} className="bg-gray-50 border border-gray-200 p-4 rounded-2xl">
                           <div className="flex justify-between items-start mb-3">
                             <div>
                               <p className="font-bold text-sm">{flatMembers.find(m=>m.uid===txn.from)?.name} sent you</p>
                               <p className="text-xs text-gray-500">{new Date(txn.date).toLocaleDateString()}</p>
                             </div>
                             <p className="font-bold text-lg text-green-600">₹{txn.amount}</p>
                           </div>
                           {txn.proofUrl && (
                             <img src={txn.proofUrl} alt="Payment Screenshot" className="w-full rounded-xl border border-gray-200 mb-3 max-h-48 object-contain bg-gray-100" />
                           )}
                           <button onClick={() => handleApprovePayment(txn.transactionId)} disabled={isSubmitting} className="w-full bg-black text-white py-2.5 rounded-xl text-sm font-bold flex justify-center gap-2 items-center hover:bg-gray-800 disabled:opacity-50 active:scale-95 transition-all">
                              {isSubmitting ? <Loader2 className="w-4 h-4 animate-spin"/> : "Approve Payment"}
                           </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* ADD / EDIT EXPENSE MODAL */}
              {modalType === "addExpense" && (
                <form onSubmit={handleAddExpense} className="overflow-y-auto pr-2">
                  <div className="mb-6">
                    <div className="w-12 h-12 bg-[#34C759]/10 rounded-2xl flex items-center justify-center mb-4">
                      <Banknote className="w-6 h-6 text-[#34C759]" />
                    </div>
                    <h3 className="text-2xl font-bold text-[#1D1D1F]">{editingTxnId ? "Edit Expense" : "Add Expense"}</h3>
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
                    
                    <div className="pt-2">
                       <label className="block text-sm font-semibold text-[#86868B] mb-2 ml-1">Divide among</label>
                       <select value={splitType} onChange={(e)=> { setSplitType(e.target.value); setSplitAmong([]); }} className="w-full bg-[#F5F5F7] text-[#1D1D1F] px-4 py-3.5 rounded-xl text-base outline-none border border-transparent focus:border-[#34C759] focus:bg-white transition-all appearance-none cursor-pointer font-medium">
                          <option value="all">Everyone in Flat</option>
                          <option value="custom">Specific Flatmates</option>
                       </select>

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
                    {!isSubmitting && (editingTxnId ? "Update Expense" : "Save Expense")}
                  </button>
                </form>
              )}

              {/* EDIT FLAT & ADMIN SETTINGS MODAL */}
              {(modalType === "create" || modalType === "editFlat") && (
                <form onSubmit={modalType === "create" ? handleCreateFlat : handleEditFlat} className="overflow-y-auto pr-2">
                  <div className="mb-6">
                    <div className="w-12 h-12 bg-[#0071E3]/10 rounded-2xl flex items-center justify-center mb-4">
                      {modalType === "create" ? <Plus className="w-6 h-6 text-[#0071E3]" /> : <Settings className="w-6 h-6 text-[#0071E3]" />}
                    </div>
                    <h3 className="text-2xl font-bold text-[#1D1D1F]">{modalType === "create" ? "Setup New Flat" : "Flat Settings"}</h3>
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
                    
                    {/* ADMIN CONTROL: LOCK FLAT */}
                    {modalType === "editFlat" && flatData?.createdBy === user?.uid && (
                      <div className="flex items-center justify-between p-4 bg-red-50 rounded-xl border border-red-100 mt-2">
                        <div>
                          <h4 className="text-sm font-bold text-red-700">Lock Flat Ledger</h4>
                          <p className="text-xs text-red-600/80">Prevent new expenses from being added.</p>
                        </div>
                        <input type="checkbox" checked={isFlatLocked} onChange={(e) => setIsFlatLocked(e.target.checked)} className="w-5 h-5 text-red-600 bg-white border-gray-300 rounded focus:ring-red-500 focus:ring-2 cursor-pointer" />
                      </div>
                    )}
                  </div>
                  <button type="submit" disabled={isSubmitting || !inputValue || !address} className="w-full bg-[#0071E3] hover:bg-[#0077ED] disabled:opacity-50 text-white py-3.5 rounded-xl font-semibold flex items-center justify-center gap-2 transition-all active:scale-95">
                    {isSubmitting && <Loader2 className="w-5 h-5 animate-spin" />}
                    {!isSubmitting && (modalType === "create" ? "Create Flat" : "Save Changes")}
                  </button>
                </form>
              )}

              {/* 4. JOIN FLAT MODAL */}
              {modalType === "join" && (
                <form onSubmit={handleJoinFlat} className="overflow-y-auto pr-2">
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
                <div className="overflow-y-auto pr-2">
                  <div className="flex items-center gap-3 mb-6">
                    <div className="p-3 bg-[#0071E3]/10 text-[#0071E3] rounded-2xl"><History className="w-6 h-6"/></div>
                    <h3 className="text-2xl font-bold text-[#1D1D1F]">Previous Flats</h3>
                  </div>
                  <div className="space-y-3">
                    {(userData?.pastFlats || []).map((pf: any, idx: number) => (
                      <div key={idx} onClick={() => { handleViewPastFlat(pf); }} className="flex justify-between items-center p-4 bg-[#F5F5F7] border border-transparent hover:border-gray-200 rounded-2xl cursor-pointer group transition-all active:scale-95">
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
                <div className="overflow-y-auto pr-2">
                  <div className="flex items-center gap-3 mb-6 border-b border-gray-100 pb-4">
                    <button onClick={() => setModalType("pastFlats")} className="p-2 bg-[#F5F5F7] hover:bg-gray-200 rounded-full transition-colors active:scale-scale-95">
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

              {/* LEAVE CONFIRM MODAL */}
              {modalType === "leaveConfirm" && (
                <div className="text-center py-2 overflow-y-auto pr-2">
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
              
              {/* TRANSFER ADMIN MODAL */}
              {modalType === "transferAdmin" && (
                <div className="overflow-y-auto pr-2">
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