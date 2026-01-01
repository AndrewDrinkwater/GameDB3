import { HashRouter, Route, Routes } from "react-router-dom";
import App from "./App";

function AppRouter() {
  return (
    <HashRouter>
      <Routes>
        <Route path="/*" element={<App />} />
      </Routes>
    </HashRouter>
  );
}

export default AppRouter;
