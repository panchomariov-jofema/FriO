import { app } from './config';
import { getFirestore, collection, getDocs } from 'firebase/firestore';

const db = getFirestore(app);

async function run() {
  const querySnapshot = await getDocs(collection(db, 'otherFruitReceptions'));
  console.log(`Encontrados ${querySnapshot.size} documentos de recepción.`);
  
  querySnapshot.forEach((doc) => {
    const data = doc.data();
    const items = data.items || [];
    items.forEach((item: any, idx: number) => {
      if (item.status === 'Almacenado' && item.storageLocation?.chamberId === 'CAMARA-6') {
        console.log(`[Doc: ${data.document || doc.id}] Coord: ${item.storageLocation.coordinate} - Producto: ${item.productName} - Cantidad: ${item.quantity} - Obs: ${item.observation || '(Sin observación)'}`);
      }
    });
  });
}

run().catch(console.error);
