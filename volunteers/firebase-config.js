const firebaseConfig = {
  apiKey: "AIzaSyCseolhm08ajtMdrvl5HxWCOErEj-hl9X4",
  authDomain: "temple-volunteers-8ff23.firebaseapp.com",
  projectId: "temple-volunteers-8ff23",
  storageBucket: "temple-volunteers-8ff23.firebasestorage.app",
  messagingSenderId: "298846932775",
  appId: "1:298846932775:web:4af5ac5bb9e2c263c02302",
  measurementId: "G-3XXH67RBBF",
};

const isFirebaseConfigured =
  firebaseConfig.apiKey !== "YOUR_API_KEY" &&
  firebaseConfig.appId !== "YOUR_APP_ID";
const useDemoMode =
  new URLSearchParams(window.location.search).get("demo") === "true";

let firebaseApp = null;
let auth = null;
let db = null;
let functions = null;

if (isFirebaseConfigured && !useDemoMode && window.firebase) {
  firebaseApp = firebase.initializeApp(firebaseConfig);
  auth = firebase.auth();
  db = firebase.firestore();
  functions = firebase.functions();
}
