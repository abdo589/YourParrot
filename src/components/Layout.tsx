import { useState } from "react";
import { NavLink, Outlet, useLocation } from "react-router-dom";
import { useAuth } from "../lib/auth";
import { useI18n } from "../lib/i18n";
import { getTheme, setTheme } from "../lib/theme";
import { addAccount, activeAccountKey, forgetAccount, savedAccounts, switchAccount } from "../lib/supabase";
import { GROUPS, NAV, visible } from "./nav";
import { NotificationsBell, useUnreadMessages } from "./Notifications";
import { BugReportButton } from "./BugReport";
import { IdleGuard } from "./IdleGuard";
import { Advisor } from "./Advisor";

export function Layout() {
  const { profile, can, signOut } = useAuth();
  const { t, lang, setLang } = useI18n();
  const [menu, setMenu] = useState(false);
  const [theme, setThemeState] = useState(getTheme());
  const unread = useUnreadMessages();
  const loc = useLocation();
  const items = NAV.filter((i) => visible(i, can));
  const groups = Object.keys(GROUPS).filter((g) => items.some((i) => i.group === g));

  return (
    <div className="shell">
      {menu && <div className="scrim" onClick={() => setMenu(false)} />}
      <aside className={`sidebar ${menu ? "open" : ""}`} onClick={(e) => (e.target as HTMLElement).closest("a") && setMenu(false)}>
        <div className="brand"><img src="/icons/logo.svg" alt="" /><div><b>METAL FUZE</b><small>PROJECTS</small></div></div>
        <nav className="nav">
          {groups.map((g) => (
            <div className="nav-group" key={g}>
              <span>{lang === "ar" ? GROUPS[g].ar : GROUPS[g].en}</span>
              {items.filter((i) => i.group === g).map((i) => (
                <NavLink key={i.to} to={i.to} end={i.to === "/hr" || i.to === "/cp"}>
                  <span>{lang === "ar" ? i.ar : i.en}</span>
                  {i.to === "/messages" && unread > 0 && <span className="count">{unread}</span>}
                </NavLink>
              ))}
            </div>
          ))}
        </nav>
      </aside>
      <div className="main">
        <header className="topbar">
          <button className="ghost icon menu-btn" onClick={() => setMenu(true)} aria-label="menu">☰</button>
          <span className="title">METAL FUZE PROJECTS</span>
          <span className="spacer" />
          <NotificationsBell />
          <BugReportButton />
          <button className="ghost icon" title={t("الوضع الداكن/الفاتح", "Dark/light")}
            onClick={() => { const n = theme === "dark" ? "light" : "dark"; setTheme(n); setThemeState(n); }}>{theme === "dark" ? "☀" : "☾"}</button>
          <button className="ghost sm" onClick={() => setLang(lang === "ar" ? "en" : "ar")}>{lang === "ar" ? "EN" : "عربي"}</button>
          {profile?.can_multi_account && <AccountSwitcher />}
          <span className="muted who" style={{ fontSize: 12 }}>{lang === "en" && profile?.full_name_en ? profile.full_name_en : profile?.full_name}</span>
          <button className="sm" onClick={() => signOut()}>{t("خروج", "Sign out")}</button>
        </header>
        <main className="content" key={loc.pathname}><Outlet /></main>
      </div>
      <IdleGuard />
      <Advisor />
    </div>
  );
}

function AccountSwitcher() {
  const { t } = useI18n();
  const accounts = savedAccounts();
  return (
    <select style={{ width: 150 }} value={activeAccountKey} onChange={(e) => {
      const v = e.target.value;
      if (v === "__add") addAccount();
      else if (v.startsWith("__rm:")) { forgetAccount(v.slice(5)); location.reload(); }
      else switchAccount(v);
    }}>
      {accounts.map((a) => <option key={a.key} value={a.key}>{a.label}</option>)}
      <option value="__add">＋ {t("إضافة حساب", "Add account")}</option>
      {accounts.filter((a) => a.key !== activeAccountKey).map((a) =>
        <option key={"rm" + a.key} value={`__rm:${a.key}`}>✕ {t("إزالة", "Remove")} {a.label}</option>)}
    </select>
  );
}
