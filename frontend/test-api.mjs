const res = await fetch('http://localhost:3000/api/resume/analyze', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ text: 'John Doe john@test.com +91 9876543210. Education B.Tech CS 2023 CGPA 8.5. Skills Python React Node.js Docker AWS. Experience Software Engineer TCS 2023-2024. Projects Blog App React deployed to 500 users.' }),
});
const d = await res.json();
console.log('HTTP Status:', res.status);
console.log('Full response:', JSON.stringify(d, null, 2).slice(0, 2000));
