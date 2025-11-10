// app/routes/index.jsx
import { Link } from "@remix-run/react";
import styles from "./_index/styles.module.css"; // this file exists per the build log

export default function Index() {
  return (
    <div className={styles.wrapper}>
      <h1>Welcome</h1>
      <p>Home page</p>
      <Link to="/app">Go to app</Link>
    </div>
  );
}
