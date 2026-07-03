const { initializeApp } = require("firebase/app");
const { getFirestore, doc, updateDoc } = require("firebase/firestore");

const firebaseConfig = {
  projectId: "frigomanagerm1-96752421-f2f17",
  appId: "1:873975957236:web:34df8b97d4a5263ad380a1",
  apiKey: "AIzaSyC0CLOwHjYckpBDwuQYgYF4RSnMIX_P1uU",
  authDomain: "frigomanagerm1-96752421-f2f17.firebaseapp.com",
  messagingSenderId: "873975957236"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

async function run() {
  const movementRef = doc(db, "binMaterialMovements", "phrEe7BClP1rfVjrFZrv");
  await updateDoc(movementRef, {
    exporterId: "EXP005"
  });
  console.log("Document phrEe7BClP1rfVjrFZrv updated successfully: exporterId restored to EXP005");
}

run();
