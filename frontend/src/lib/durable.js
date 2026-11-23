// Còpia "segura" a IndexedDB de valors petits que l'usuari tria (p. ex. la gasolinera
// preferida). Motiu: a Android, si es tanca l'app just després de canviar-los, el
// localStorage pot perdre l'últim canvi (es desa a disc amb retard) i en tornar a obrir
// reapareix el valor antic. IndexedDB amb durability "strict" s'escriu a disc al moment.
// Cada valor porta l'hora del canvi (`at`): en obrir, guanya el més recent.
const DB = "pt-durable";
const STORE = "kv";

function openDb() {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === "undefined") { reject(new Error("sense IndexedDB")); return; }
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function durableGet(key) {
  try {
    const db = await openDb();
    return await new Promise((resolve) => {
      const r = db.transaction(STORE, "readonly").objectStore(STORE).get(key);
      r.onsuccess = () => resolve(r.result);
      r.onerror = () => resolve(undefined);
    });
  } catch { return undefined; }
}

export async function durableSet(key, value) {
  try {
    const db = await openDb();
    await new Promise((resolve) => {
      let tx;
      try { tx = db.transaction(STORE, "readwrite", { durability: "strict" }); }
      catch { tx = db.transaction(STORE, "readwrite"); }
      tx.objectStore(STORE).put(value, key);
      tx.oncomplete = tx.onerror = tx.onabort = () => resolve();
    });
  } catch { /* sense IndexedDB: queda el localStorage */ }
}
