(function(){
  const MASTER_KEY = 'paymentsJSON';
  const LEGACY_STUDENTS = 'students';
  const LEGACY_PAYMENTS = 'payments';
  const LEGACY_PROOFS = 'proofs';
  const LEGACY_FEE_STRUCTURE = 'feeStructure';

  function safeParse(raw){
    try { return raw ? JSON.parse(raw) : null; }
    catch(e){ return null; }
  }
  function pretty(o){
    try { return JSON.stringify(o, null, 2); } catch(e){ return String(o); }
  }

  // normalize proof objects so admin can reliably render them
  function normalizeProof(p){
    if(!p || typeof p !== 'object') p = {};
    // ensure id
    if(!p.id) p.id = 'P' + Math.floor(Math.random() * 1e9);
    // ensure date in ISO
    if(!p.date) p.date = new Date().toISOString();
    else {
      // try to coerce to ISO if possible
      const d = new Date(p.date);
      if(!isNaN(d)) p.date = d.toISOString();
    }
    // ensure status
    if(!p.status) p.status = 'pending';
    // keep other fields (studentId, url, month, etc.)
    return p;
  }

  // normalize arrays of proofs
  function normalizeProofsArray(arr){
    if(!Array.isArray(arr)) return [];
    return arr.map(normalizeProof);
  }

  // Build a master object from legacy keys (if master missing)
  function buildMasterIfMissing(){
    const master = safeParse(localStorage.getItem(MASTER_KEY));
    if(master) return; // already present

    const students = safeParse(localStorage.getItem(LEGACY_STUDENTS)) || [];
    const payments = safeParse(localStorage.getItem(LEGACY_PAYMENTS)) || [];
    const proofsRaw = safeParse(localStorage.getItem(LEGACY_PROOFS)) || [];
    const feeStructure = safeParse(localStorage.getItem(LEGACY_FEE_STRUCTURE)) || [];

    const proofs = normalizeProofsArray(proofsRaw);

    if(students.length || payments.length || proofs.length || feeStructure.length){
      const newMaster = { students: [...students], payments: [...payments], proofs: [...proofs], feeStructure: [...feeStructure] };
      localStorage.setItem(MASTER_KEY, pretty(newMaster));
      // also persist legacy keys to normalized versions so other pages see consistent shape
      localStorage.setItem(LEGACY_PROOFS, pretty(proofs));
      localStorage.setItem(LEGACY_STUDENTS, pretty(students));
      localStorage.setItem(LEGACY_PAYMENTS, pretty(payments));
      localStorage.setItem(LEGACY_FEE_STRUCTURE, pretty(feeStructure));
      // notify listeners
      dispatchMasterUpdated(newMaster);
    }
  }

  // Hydrate legacy keys from master (when master exists)
  function hydrateFromMaster(){
    const master = safeParse(localStorage.getItem(MASTER_KEY));
    if(!master || typeof master !== 'object') return;
    const students = Array.isArray(master.students) ? [...master.students] : [];
    const payments = Array.isArray(master.payments) ? [...master.payments] : [];
    const proofs = normalizeProofsArray(master.proofs || []);
    const feeStructure = Array.isArray(master.feeStructure) ? [...master.feeStructure] : [];

    // write legacy keys (normalized)
    localStorage.setItem(LEGACY_STUDENTS, pretty(students));
    localStorage.setItem(LEGACY_PAYMENTS, pretty(payments));
    localStorage.setItem(LEGACY_PROOFS, pretty(proofs));
    localStorage.setItem(LEGACY_FEE_STRUCTURE, pretty(feeStructure));

    // If master lacked normalized proofs, ensure master is updated with normalized proofs
    const masterProofsRaw = master.proofs || [];
    const masterProofsNormalized = normalizeProofsArray(masterProofsRaw);
    if(JSON.stringify(masterProofsRaw) !== JSON.stringify(masterProofsNormalized)){
      master.proofs = masterProofsNormalized;
      localStorage.setItem(MASTER_KEY, pretty(master));
    }

    dispatchMasterUpdated(master);
  }

  // One-stop reconcile: make sure master exists and legacy keys are consistent
  function reconcileAll(){
    const master = safeParse(localStorage.getItem(MASTER_KEY));
    if(master){
      // ensure proofs normalized in master and reflect them into legacy keys
      const proofsNorm = normalizeProofsArray(master.proofs || []);
      master.proofs = proofsNorm;
      localStorage.setItem(MASTER_KEY, pretty(master));
      hydrateFromMaster();
      return;
    }
    // build if missing
    buildMasterIfMissing();
  }

  // utility: dispatch a custom event so pages can listen for structured master updates
  function dispatchMasterUpdated(master){
    try{
      const ev = new CustomEvent('tft-master-updated', { detail: master });
      window.dispatchEvent(ev);
    } catch(e){
      // fallback: basic event
      window.dispatchEvent(new Event('tft-master-updated'));
    }
  }

  // Exposed API
  window.TFT = window.TFT || {};

  // return parsed master (safe)
  window.TFT.getMaster = function(){
    return safeParse(localStorage.getItem(MASTER_KEY)) || { students: [], payments: [], proofs: [], feeStructure: [] };
  };

  // save legacy -> master (keeps previous contracts)
  window.TFT.saveJSON = function(){
    const students = safeParse(localStorage.getItem(LEGACY_STUDENTS)) || [];
    const payments = safeParse(localStorage.getItem(LEGACY_PAYMENTS)) || [];
    const proofsRaw = safeParse(localStorage.getItem(LEGACY_PROOFS)) || [];
    const feeStructure = safeParse(localStorage.getItem(LEGACY_FEE_STRUCTURE)) || [];

    const proofs = normalizeProofsArray(proofsRaw);

    const master = { students: [...students], payments: [...payments], proofs: [...proofs], feeStructure: [...feeStructure] };
    localStorage.setItem(MASTER_KEY, pretty(master));

    // ensure legacy proofs saved normalized too
    localStorage.setItem(LEGACY_PROOFS, pretty(proofs));
    dispatchMasterUpdated(master);
  };

  // hydrate legacy keys from master
  window.TFT.loadFromJSON = hydrateFromMaster;

  // addProof helper: accepts a proof object, normalizes it, appends and saves master
  window.TFT.addProof = function(proofObj){
    try{
      const master = safeParse(localStorage.getItem(MASTER_KEY)) || { students: [], payments: [], proofs: [], feeStructure: [] };
      const proofs = normalizeProofsArray(master.proofs || []);
      const p = normalizeProof(proofObj);
      proofs.push(p);
      master.proofs = proofs;
      localStorage.setItem(MASTER_KEY, pretty(master));
      // keep legacy key in sync
      localStorage.setItem(LEGACY_PROOFS, pretty(proofs));
      dispatchMasterUpdated(master);
      return p; // return the normalized proof (with id/date/status)
    } catch(e){
      console.error('TFT.addProof error', e);
      return null;
    }
  };

  // also provide a convenience function to replace entire master if needed
  window.TFT.replaceMaster = function(newMaster){
    try{
      if(!newMaster || typeof newMaster !== 'object') return false;
      newMaster.proofs = normalizeProofsArray(newMaster.proofs || []);
      localStorage.setItem(MASTER_KEY, pretty(newMaster));
      hydrateFromMaster();
      dispatchMasterUpdated(newMaster);
      return true;
    } catch(e){
      console.error('TFT.replaceMaster error', e);
      return false;
    }
  };

  // initial reconcile & hydration
  reconcileAll();
  setTimeout(reconcileAll, 50);

  // watch storage events and coordinate updates across tabs
  window.addEventListener('storage', function(e){
    try {
      if(!e.key) return;
      if(e.key === MASTER_KEY){
        // when master changes in another tab, hydrate legacy and notify
        hydrateFromMaster();
      } else if ([LEGACY_STUDENTS, LEGACY_PAYMENTS, LEGACY_PROOFS, LEGACY_FEE_STRUCTURE].includes(e.key)) {
        // when a legacy key changes (e.g., student page saved to 'proofs'), rebuild master
        window.TFT.saveJSON();
      }
    } catch(err){ console.error('TFT sync error', err); }
  });

  // small ready indicator
  setTimeout(function(){
    try {
      window.TFT.ready = true;
      window.dispatchEvent(new Event('tft-ready'));
    } catch(e){ console.warn('TFT ready event failed', e); }
  }, 80);
})();
