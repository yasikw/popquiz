export default async function globalTeardown() {
  console.log('🏁 Security test suite completed.');
  
  // Cleanup any global resources if needed
  process.exit(0);
}