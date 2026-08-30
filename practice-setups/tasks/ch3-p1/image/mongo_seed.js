db = db.getSiblingDB("dashboard");

db.profiles.insertMany([
  { _id: 1, theme: "dark", favoriteEditor: "Neovim" },
  { _id: 2, theme: "light", favoriteEditor: "VS Code" }
]);
