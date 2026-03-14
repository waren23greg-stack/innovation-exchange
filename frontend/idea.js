const API   = 'https://innovation-exchange.onrender.com/api';
const token = localStorage.getItem('accessToken');

if (!token) window.location.href = 'auth.html';

const ideaForm = document.getElementById('ideaForm');
if (ideaForm) {
  ideaForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const title           = document.getElementById('title').value;
    const category        = document.getElementById('category')?.value;
    const asking_price_usd = document.getElementById('price')?.value;
    try {
      const res  = await fetch(`${API}/ideas`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({ title, category, asking_price_usd })
      });
      const data = await res.json();
      if (data.idea) {
        alert('Idea submitted! Fingerprint: ' + data.idea.idea_fingerprint.substring(0, 16) + '...');
        window.location.href = 'index.html';
      } else {
        alert(data.error || 'Submission failed');
      }
    } catch(err) {
      alert('Network error: ' + err.message);
    }
  });
}
