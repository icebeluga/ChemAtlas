import { createRoot } from "react-dom/client";
import { AuthApp } from "./auth-app";
import "../app/globals.css";
import "../app/student-redesign.css";
import "./auth.css";
import "../app/theme.css";

createRoot(document.getElementById("root")!).render(<AuthApp />);
