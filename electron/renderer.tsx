import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "../src/styles.css";
import { Studio } from "../src/routes/index";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <Studio />
  </StrictMode>,
);
