const bcrypt = require('bcrypt');

async function main() {
    const hash = await bcrypt.hash('Diagsa2024', 10);
    console.log(hash);
}

main();