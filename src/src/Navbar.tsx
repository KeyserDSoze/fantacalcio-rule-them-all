import React from 'react';

const Navbar: React.FC = () => (
  <nav style={{
    width: '100%',
    background: '#1976d2',
    color: 'white',
    padding: '12px 0',
    marginBottom: 32,
    boxShadow: '0 2px 8px #0001',
    position: 'fixed',
    top: 0,
    left: 0,
    zIndex: 1000,
  }}>
    <div style={{ maxWidth: 900, margin: '0 auto', display: 'flex', alignItems: 'center', gap: 24 }}>
      <a href="/" style={{ color: 'white', fontWeight: 'bold', fontSize: 20, textDecoration: 'none' }}>Dashboard</a>
      <a href="/standardize" style={{ color: 'white', fontWeight: 'bold', fontSize: 16, textDecoration: 'none' }}>Standardizza titolari</a>
    </div>
  </nav>
);

export default Navbar;
