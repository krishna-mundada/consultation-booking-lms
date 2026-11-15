import nextVitals from "eslint-config-next/core-web-vitals";
import nextTypescript from "eslint-config-next/typescript";

// eslint-config-next 16 ships native flat configs, so no FlatCompat shim is needed.
const eslintConfig = [
  { ignores: [".next/**", "node_modules/**", "next-env.d.ts", "playwright-report/**", "test-results/**"] },
  ...nextVitals,
  ...nextTypescript,
];

export default eslintConfig;
