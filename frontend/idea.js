const ideaForm = document.getElementById('ideaForm');
ideaForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const token = localStorage.getItem('token');
    const title = document.getElementById('title').value;
    const description = document.getElementById('description').value;

    const res = await fetch('http://localhost:5000/api/ideas/create', {
        method: 'POST',
        headers: { 
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ title, description })
    });

    const data = await res.json();
    if (data.idea) {
        alert('Idea submitted successfully!');
        window.location.href = 'dashboard.html';
    } else {
        alert(data.error || 'Submission failed');
    }
});