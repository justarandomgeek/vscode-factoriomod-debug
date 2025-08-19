import { execSync } from "child_process";

if (process.env.NODE_ENV !== 'production') {
	console.log('Running dev postinstall...');
	execSync("npx patch-package", { stdio: 'inherit' });
} else {
	console.log('Skipping dev postinstall');
}