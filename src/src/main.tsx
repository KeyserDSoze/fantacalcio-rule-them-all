import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx';
// import StandardizeTitolari from './StandardizeTitolari';
// import Navbar from './Navbar';

// const url = window.location.pathname;
// const isStandardPage = url.includes('standardize');

function MainRouter() {
  return (
    <>
      <App />
      {/* <Navbar />
      <div style={{ paddingTop: 64 }}>
        {isStandardPage ? <StandardizeTitolari /> : <App />}
      </div> */}
    </>
  );
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <MainRouter />
  </StrictMode>,
);
