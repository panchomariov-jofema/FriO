const { initializeApp } = require('firebase/app');
const { getAuth, signInAnonymously } = require('firebase/auth');
const { getFirestore, collection, getDocs } = require('firebase/firestore');

const firebaseConfig = {
  projectId: 'frigomanagerm1-96752421-f2f17',
  appId: '1:873975957236:web:34df8b97d4a5263ad380a1',
  apiKey: 'AIzaSyC0CLOwHjYckpBDwuQYgYF4RSnMIX_P1uU',
  authDomain: 'frigomanagerm1-96752421-f2f17.firebaseapp.com',
  messagingSenderId: '873975957236'
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

async function runAudit() {
  console.log('====================================================');
  console.log(' FriO — Auditoría de Integridad y Salud de Datos');
  console.log(` Fecha de ejecución: ${new Date().toLocaleString('es-CL')}`);
  console.log('====================================================\n');

  await signInAnonymously(auth);

  const issues = [];
  const warnings = [];

  // 1. Auditar otherFruitMovements
  console.log('🔎 Verificando otherFruitMovements...');
  const movSnap = await getDocs(collection(db, 'otherFruitMovements'));
  movSnap.docs.forEach(docSnap => {
    const d = docSnap.data();
    const id = docSnap.id;

    // Chequeo de items[]
    if (d.items !== undefined) {
      if (!Array.isArray(d.items)) {
        issues.push({
          severity: 'CRÍTICO',
          collection: 'otherFruitMovements',
          id,
          description: `El campo 'items' NO es un Array (tipo: ${typeof d.items}). Esto bota las vistas de Fall Creek, Despachos y Kardex.`
        });
      } else {
        d.items.forEach((it, idx) => {
          if (typeof it?.quantity !== 'number' || isNaN(it.quantity)) {
            issues.push({
              severity: 'ALERTA',
              collection: 'otherFruitMovements',
              id,
              description: `Ítem [${idx}] tiene cantidad inválida o no numérica: ${it?.quantity}`
            });
          }
        });
      }
    }

    // Chequeo de locations[]
    if (d.locations !== undefined && !Array.isArray(d.locations)) {
      issues.push({
        severity: 'CRÍTICO',
        collection: 'otherFruitMovements',
        id,
        description: `El campo 'locations' NO es un Array.`
      });
    }
  });

  // 2. Auditar otherFruitReceptions
  console.log('🔎 Verificando otherFruitReceptions...');
  const recSnap = await getDocs(collection(db, 'otherFruitReceptions'));
  recSnap.docs.forEach(docSnap => {
    const d = docSnap.data();
    const id = docSnap.id;

    if (d.items !== undefined) {
      if (!Array.isArray(d.items)) {
        issues.push({
          severity: 'CRÍTICO',
          collection: 'otherFruitReceptions',
          id,
          description: `El campo 'items' NO es un Array (tipo: ${typeof d.items}).`
        });
      } else {
        d.items.forEach((it, idx) => {
          if (!it) {
            warnings.push({
              collection: 'otherFruitReceptions',
              id,
              description: `Ítem [${idx}] es null o undefined.`
            });
            return;
          }
          // Si está Almacenado debe tener storageLocation con cámara y coordenada
          if (it.status === 'Almacenado' && it.quantity > 0) {
            if (!it.storageLocation || !it.storageLocation.chamberId || !it.storageLocation.coordinate) {
              warnings.push({
                collection: 'otherFruitReceptions',
                id,
                description: `Ítem [${idx}] (${it.palletId || it.containerId}) figura 'Almacenado' con cantidad ${it.quantity} pero no tiene cámara/coordenada válida.`
              });
            }
          }
          // Si está Despachado pero tiene cantidad > 0
          if (it.status === 'Despachado' && it.quantity > 0) {
            warnings.push({
              collection: 'otherFruitReceptions',
              id,
              description: `Ítem [${idx}] (${it.palletId || it.containerId}) figura 'Despachado' pero conserva cantidad ${it.quantity} > 0.`
            });
          }
        });
      }
    }
  });

  // 3. Auditar packagingMovements
  console.log('🔎 Verificando packagingMovements...');
  const pkgMovSnap = await getDocs(collection(db, 'packagingMovements'));
  pkgMovSnap.docs.forEach(docSnap => {
    const d = docSnap.data();
    const id = docSnap.id;
    if (d.items !== undefined && !Array.isArray(d.items)) {
      issues.push({
        severity: 'CRÍTICO',
        collection: 'packagingMovements',
        id,
        description: `El campo 'items' NO es un Array.`
      });
    }
  });

  // 4. Auditar packagingReceptions
  console.log('🔎 Verificando packagingReceptions...');
  const pkgRecSnap = await getDocs(collection(db, 'packagingReceptions'));
  pkgRecSnap.docs.forEach(docSnap => {
    const d = docSnap.data();
    const id = docSnap.id;
    if (d.items !== undefined && !Array.isArray(d.items)) {
      issues.push({
        severity: 'CRÍTICO',
        collection: 'packagingReceptions',
        id,
        description: `El campo 'items' NO es un Array.`
      });
    }
  });

  // 5. Auditar binMaterialMovements
  console.log('🔎 Verificando binMaterialMovements...');
  const binMovSnap = await getDocs(collection(db, 'binMaterialMovements'));
  binMovSnap.docs.forEach(docSnap => {
    const d = docSnap.data();
    const id = docSnap.id;
    if (d.items !== undefined && !Array.isArray(d.items)) {
      issues.push({
        severity: 'CRÍTICO',
        collection: 'binMaterialMovements',
        id,
        description: `El campo 'items' NO es un Array.`
      });
    }
  });

  console.log('\n====================================================');
  console.log(' RESULTADOS DE LA AUDITORÍA');
  console.log('====================================================');

  if (issues.length === 0) {
    console.log('✅ ESTADO: SALUDABLE. Cero anomalías críticas en las colecciones inspeccionadas.');
  } else {
    console.log(`❌ SE ENCONTRARON ${issues.length} ANOMALÍA(S) CRÍTICA(S):`);
    issues.forEach((iss, i) => {
      console.log(`  [${i + 1}] [${iss.severity}] ${iss.collection}/${iss.id}: ${iss.description}`);
    });
  }

  if (warnings.length > 0) {
    console.log(`\n⚠️  ADVERTENCIAS OPERATIVAS (${warnings.length}):`);
    warnings.slice(0, 10).forEach((w, i) => {
      console.log(`  - ${w.collection}/${w.id}: ${w.description}`);
    });
    if (warnings.length > 10) {
      console.log(`  ... y ${warnings.length - 10} advertencias adicionales.`);
    }
  }

  console.log('====================================================\n');
  process.exit(issues.length > 0 ? 1 : 0);
}

runAudit().catch(err => {
  console.error('Error fatal durante la auditoría:', err);
  process.exit(1);
});
