import db from '@adonisjs/lucid/services/db';
import Store from '#models/store';

async function run() {
    const total = await db.from('stores').count('* as total');
    const active = await db.from('stores').where('is_active', true).count('* as total');
    const running = await db.from('stores').where('is_running', true).count('* as total');

    console.log('--- DB Raw Counts ---');
    console.log('Total:', total[0].total);
    console.log('Active:', active[0].total);
    console.log('Running:', running[0].total);

    const stores = await Store.all();
    console.log('\n--- Store Model All ---');
    console.log('Count:', stores.length);
    stores.forEach(s => {
        console.log(`- ${s.name} (ID: ${s.id}, Active: ${s.is_active}, Running: ${s.is_running}, UserID: ${s.user_id})`);
    });
}

run().then(() => process.exit(0)).catch(err => {
    console.error(err);
    process.exit(1);
});
