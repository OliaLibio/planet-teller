// Planet Teller – kurze Rezepte zu den Gerichten, die die App vorschlägt.
// -----------------------------------------------------------------------------
// Schlüssel = Name des Gerichts in foods.js.
// zutaten: [Name in foods.js, Menge in g/ml für das ganze Rezept, Anzeige (optional)]
// Die Werte pro Portion rechnet die App aus den Zutaten selbst aus.
// Salz, Pfeffer und ähnliches stecken in „Gewürze, getrocknet“.

const RECIPES = {
  "Nudelsalat": {
    portionen: 2, zeit: "25 Min.", art: "leichte Variante mit Essig-Öl-Dressing statt Mayonnaise",
    zutaten: [
      ["Pasta (trocken)", 150, "Nudeln, z. B. Fusilli"], ["Paprika", 150, "1 rote Paprika"], ["Gurke", 150, "½ Gurke"],
      ["Mais (Dose)", 100], ["Erbsen", 100, "Erbsen (TK)"], ["Zwiebeln", 40, "½ rote Zwiebel"],
      ["Rapsöl", 20, "2 EL Öl"], ["Essig", 20, "2 EL Essig"], ["Senf", 5, "1 TL Senf"],
      ["Kräuter, frisch", 10, "Petersilie oder Schnittlauch"], ["Gewürze, getrocknet", 2, "Salz, Pfeffer, Prise Zucker"]
    ],
    schritte: [
      "Nudeln bissfest kochen, in den letzten 2 Minuten die Erbsen mitgaren. Abgießen, dabei 3 EL Nudelwasser auffangen, kalt abschrecken.",
      "Paprika, Gurke und Zwiebel klein würfeln, Mais abtropfen lassen.",
      "Essig, Öl, Senf, Nudelwasser, Salz, Pfeffer und eine Prise Zucker verrühren.",
      "Alles mischen, mindestens 20 Minuten ziehen lassen, Kräuter darüber."
    ],
    tipp: "Cremiger wird es mit 3 EL Naturjoghurt im Dressing. Hält sich gekühlt 2 Tage – gut fürs Mittagessen unterwegs."
  },
  "Spaghetti mit Linsen-Bolognese": {
    portionen: 2, zeit: "30 Min.",
    zutaten: [
      ["Pasta (trocken)", 160, "Spaghetti"], ["Linsen (trocken)", 80, "rote Linsen"], ["Tomaten (Dose) / Passata", 400, "1 Dose gehackte Tomaten"],
      ["Zwiebeln", 80, "1 Zwiebel"], ["Karotten", 80, "1 Karotte"], ["Knoblauch", 4, "1 Zehe"],
      ["Olivenöl", 10, "1 EL"], ["Gewürze, getrocknet", 4, "Oregano, Salz, Pfeffer"]
    ],
    schritte: [
      "Zwiebel, Karotte und Knoblauch fein würfeln und im Öl 5 Minuten anbraten.",
      "Linsen, Tomaten und 200 ml Wasser dazu, 15 Minuten köcheln lassen, bis die Linsen weich sind.",
      "Inzwischen die Spaghetti kochen.",
      "Sauce mit Oregano, Salz und Pfeffer abschmecken und zu den Nudeln servieren."
    ],
    tipp: "Rote Linsen zerfallen und machen die Sauce wie Hackfleisch – ohne Einweichen."
  },
  "Spaghetti mit Tomatensauce": {
    portionen: 2, zeit: "20 Min.",
    zutaten: [
      ["Pasta (trocken)", 160, "Spaghetti"], ["Tomaten (Dose) / Passata", 400, "1 Dose Tomaten"], ["Zwiebeln", 60, "1 kleine Zwiebel"],
      ["Knoblauch", 4, "1 Zehe"], ["Olivenöl", 15, "1½ EL"], ["Kräuter, frisch", 10, "Basilikum"], ["Gewürze, getrocknet", 2, "Salz, Pfeffer"]
    ],
    schritte: [
      "Zwiebel und Knoblauch fein hacken und im Öl glasig dünsten.",
      "Tomaten dazugeben und 10 Minuten offen köcheln lassen.",
      "Spaghetti kochen, Sauce abschmecken, mit Basilikum servieren."
    ],
    tipp: "Mit einer Dose Kichererbsen oder weißen Bohnen in der Sauce wird daraus ein Gericht mit viel mehr Protein."
  },
  "Pasta mit Pesto": {
    portionen: 2, zeit: "15 Min.",
    zutaten: [
      ["Pasta (trocken)", 160, "Nudeln"], ["Pesto", 60, "4 EL Pesto"], ["Tomaten", 150, "Kirschtomaten"],
      ["Rucola", 30, "1 Handvoll Rucola"], ["Parmesan", 10, "etwas Parmesan (optional)"]
    ],
    schritte: [
      "Nudeln kochen, 3 EL Nudelwasser aufheben.",
      "Pesto mit dem Nudelwasser verrühren und unter die Nudeln mischen.",
      "Mit halbierten Tomaten und Rucola anrichten, Parmesan darüber."
    ],
    tipp: "Ohne Parmesan und mit veganem Pesto ist das Gericht rein pflanzlich."
  },
  "Falafel im Brot": {
    portionen: 2, zeit: "20 Min.",
    zutaten: [
      ["Falafel", 140, "8 Falafel (fertig oder TK)"], ["Fladenbrot / Pita", 160, "2 Fladenbrote"], ["Salat (Blattsalat)", 60],
      ["Tomaten", 100], ["Gurke", 100], ["Tahin (Sesammus)", 30, "2 EL Tahin"], ["Zitronensaft", 10, "1 EL Zitronensaft"]
    ],
    schritte: [
      "Falafel im Ofen oder in der Pfanne erwärmen.",
      "Tahin mit Zitronensaft, Salz und 2–3 EL Wasser zu einer Sauce rühren.",
      "Brot aufbacken, aufschneiden, mit Salat, Gemüse, Falafel und Sauce füllen."
    ]
  },
  "Chili sin Carne": {
    portionen: 2, zeit: "30 Min.",
    zutaten: [
      ["Kidneybohnen (Dose)", 250, "1 Dose Kidneybohnen"], ["Mais (Dose)", 140, "1 kleine Dose Mais"], ["Tomaten (Dose) / Passata", 400, "1 Dose Tomaten"],
      ["Paprika", 150, "1 Paprika"], ["Zwiebeln", 80, "1 Zwiebel"], ["Knoblauch", 4, "1 Zehe"],
      ["Rapsöl", 10, "1 EL"], ["Gewürze, getrocknet", 6, "Kreuzkümmel, Paprikapulver, Chili, Salz"]
    ],
    schritte: [
      "Zwiebel, Knoblauch und Paprika würfeln und im Öl anbraten.",
      "Gewürze kurz mitrösten, dann Tomaten, Bohnen und Mais dazugeben.",
      "20 Minuten köcheln lassen, abschmecken."
    ],
    tipp: "Dazu passen Reis, Brot oder ein Klecks Joghurt. Schmeckt aufgewärmt am nächsten Tag noch besser."
  },
  "Linsensuppe": {
    portionen: 2, zeit: "35 Min.",
    zutaten: [
      ["Linsen (trocken)", 120, "Tellerlinsen"], ["Kartoffeln, gekocht", 200, "2 Kartoffeln"], ["Karotten", 150, "2 Karotten"],
      ["Lauch", 100, "1 Stück Lauch"], ["Zwiebeln", 80, "1 Zwiebel"], ["Gemüsebrühe", 800],
      ["Rapsöl", 10, "1 EL"], ["Essig", 10, "1 EL Essig zum Schluss"], ["Gewürze, getrocknet", 3, "Majoran, Salz, Pfeffer"]
    ],
    schritte: [
      "Zwiebel, Karotten, Lauch und Kartoffeln würfeln und im Öl kurz anbraten.",
      "Linsen und Brühe dazugeben, 25–30 Minuten köcheln, bis alles weich ist.",
      "Mit Majoran, Salz, Pfeffer und einem Schuss Essig abschmecken."
    ]
  },
  "Linsen-Dal mit Reis": {
    portionen: 2, zeit: "30 Min.",
    zutaten: [
      ["Linsen (trocken)", 120, "rote Linsen"], ["Kokosmilch (Dose)", 200, "½ Dose Kokosmilch"], ["Tomaten (Dose) / Passata", 200],
      ["Zwiebeln", 80, "1 Zwiebel"], ["Knoblauch", 8, "2 Zehen"], ["Ingwer", 10, "1 Stück Ingwer"],
      ["Gewürze, getrocknet", 6, "Curry, Kurkuma, Kreuzkümmel, Salz"], ["Rapsöl", 10, "1 EL"], ["Reis (trocken)", 120, "Basmatireis"]
    ],
    schritte: [
      "Reis nach Packung kochen.",
      "Zwiebel, Knoblauch und Ingwer fein hacken, im Öl anbraten, Gewürze kurz mitrösten.",
      "Linsen, Tomaten, Kokosmilch und 300 ml Wasser dazu, 15–20 Minuten sämig köcheln.",
      "Mit Salz und etwas Zitrone abschmecken, mit dem Reis servieren."
    ]
  },
  "Gemüsecurry mit Reis": {
    portionen: 2, zeit: "30 Min.",
    zutaten: [
      ["Reis (trocken)", 120, "Reis"], ["Kokosmilch (Dose)", 200, "½ Dose Kokosmilch"], ["Brokkoli, gegart", 150, "Brokkoli"],
      ["Karotten", 150, "2 Karotten"], ["Paprika", 150, "1 Paprika"], ["Currypaste", 30, "2 EL Currypaste"], ["Rapsöl", 10, "1 EL"]
    ],
    schritte: [
      "Reis kochen.",
      "Currypaste im Öl kurz anrösten, Kokosmilch und 100 ml Wasser dazugeben.",
      "Gemüse klein schneiden, hineingeben und 10 Minuten garen.",
      "Abschmecken und mit dem Reis servieren."
    ],
    tipp: "Mit 150 g Tofu oder Kichererbsen kommt deutlich mehr Protein dazu."
  },
  "Bananenblüten-Curry (ohne Reis)": {
    portionen: 4, zeit: "35 Min.",
    zutaten: [
      ["Bananenblüte (Dose)", 460, "2 Dosen Bananenblüte, abgetropft"], ["Kokosmilch (Dose)", 400, "1 Dose Kokosmilch"],
      ["Zwiebeln", 160, "2 Zwiebeln"], ["Currypaste", 30, "2 EL Currypaste"], ["Knoblauch", 8, "2 Zehen"],
      ["Kokosöl", 15, "1 EL Kokosöl"], ["Gewürze, getrocknet", 6, "Kurkuma, Kreuzkümmel, Salz"]
    ],
    schritte: [
      "Bananenblüte abspülen, abtropfen lassen und in Streifen zupfen.",
      "Zwiebeln und Knoblauch im Kokosöl anbraten, Currypaste und Gewürze kurz mitrösten.",
      "Bananenblüte und Kokosmilch dazugeben, 20 Minuten sanft köcheln.",
      "Abschmecken, dazu Reis."
    ],
    tipp: "Mit Kichererbsen oder Tofu im Curry kommt mehr Protein auf den Teller."
  },
  "Kichererbsen-Curry mit Reis": {
    portionen: 2, zeit: "30 Min.",
    zutaten: [
      ["Kichererbsen, gekocht", 240, "1 Dose Kichererbsen"], ["Tomaten (Dose) / Passata", 400, "1 Dose Tomaten"], ["Kokosmilch (Dose)", 100],
      ["Spinat, roh", 100, "2 Handvoll Spinat"], ["Zwiebeln", 80, "1 Zwiebel"], ["Knoblauch", 4, "1 Zehe"], ["Ingwer", 10],
      ["Gewürze, getrocknet", 6, "Garam Masala oder Curry, Salz"], ["Rapsöl", 10, "1 EL"], ["Reis (trocken)", 120, "Reis"]
    ],
    schritte: [
      "Reis kochen.",
      "Zwiebel, Knoblauch und Ingwer im Öl anbraten, Gewürze kurz mitrösten.",
      "Tomaten, Kokosmilch und abgetropfte Kichererbsen dazu, 15 Minuten köcheln.",
      "Spinat unterrühren, bis er zusammenfällt. Mit dem Reis servieren."
    ]
  },
  "Gebratener Reis mit Gemüse": {
    portionen: 2, zeit: "20 Min.",
    zutaten: [
      ["Reis (trocken)", 150, "Reis, am besten am Vortag gekocht"], ["Erbsen", 100, "Erbsen (TK)"], ["Karotten", 100, "1 Karotte"],
      ["Mais (Dose)", 70], ["Zwiebeln", 50, "Frühlingszwiebeln"], ["Sojasauce", 30, "2 EL Sojasauce"], ["Rapsöl", 15, "1½ EL"]
    ],
    schritte: [
      "Gekochten Reis gut abkühlen lassen (vom Vortag ist ideal).",
      "Karotte und Zwiebeln klein schneiden, im heißen Öl anbraten, Erbsen und Mais dazu.",
      "Reis zugeben und unter Rühren knusprig braten, mit Sojasauce abschmecken."
    ],
    tipp: "Ein Rührei oder Tofuwürfel untermischen – das bringt Protein."
  },
  "Gebratene Nudeln mit Gemüse": {
    portionen: 2, zeit: "20 Min.",
    zutaten: [
      ["Pasta (trocken)", 150, "Mie- oder Udon-Nudeln"], ["Karotten", 100, "1 Karotte"], ["Paprika", 100, "½ Paprika"],
      ["Pak Choi / Chinakohl", 150, "1 Pak Choi"], ["Sojasauce", 30, "2 EL Sojasauce"], ["Ingwer", 10], ["Knoblauch", 4, "1 Zehe"], ["Rapsöl", 15, "1½ EL"]
    ],
    schritte: [
      "Nudeln nach Packung garen und abtropfen lassen.",
      "Gemüse in Streifen schneiden, mit Ingwer und Knoblauch im heißen Öl 4 Minuten braten.",
      "Nudeln und Sojasauce dazugeben und alles kurz durchschwenken."
    ]
  },
  "Gemüsesuppe": {
    portionen: 2, zeit: "30 Min.",
    zutaten: [
      ["Kartoffeln, gekocht", 200, "2 Kartoffeln"], ["Karotten", 150, "2 Karotten"], ["Lauch", 100], ["Zucchini", 150, "½ Zucchini"],
      ["Erbsen", 100, "Erbsen (TK)"], ["Gemüsebrühe", 800], ["Rapsöl", 10, "1 EL"], ["Kräuter, frisch", 10, "Petersilie"]
    ],
    schritte: [
      "Kartoffeln, Karotten und Lauch würfeln und im Öl kurz anschwitzen.",
      "Brühe dazu und 15 Minuten köcheln, dann Zucchini und Erbsen 5 Minuten mitgaren.",
      "Abschmecken, mit Petersilie servieren."
    ],
    tipp: "Mit einer Dose weißer Bohnen wird die Suppe zur sättigenden Hauptmahlzeit."
  },
  "Tomatensuppe": {
    portionen: 2, zeit: "25 Min.",
    zutaten: [
      ["Tomaten (Dose) / Passata", 800, "2 Dosen Tomaten"], ["Zwiebeln", 80, "1 Zwiebel"], ["Knoblauch", 4, "1 Zehe"],
      ["Gemüsebrühe", 200], ["Olivenöl", 10, "1 EL"], ["Hafer-Kochcreme", 50, "3 EL Hafer- oder Sahnecreme"], ["Kräuter, frisch", 10, "Basilikum"]
    ],
    schritte: [
      "Zwiebel und Knoblauch im Öl glasig dünsten.",
      "Tomaten und Brühe dazugeben, 15 Minuten köcheln.",
      "Fein pürieren, Creme einrühren, mit Basilikum servieren."
    ]
  },
  "Kartoffelsuppe": {
    portionen: 2, zeit: "30 Min.",
    zutaten: [
      ["Kartoffeln, gekocht", 500, "5 mittlere Kartoffeln"], ["Karotten", 100], ["Lauch", 100], ["Zwiebeln", 60],
      ["Gemüsebrühe", 600], ["Hafer-Kochcreme", 50, "3 EL Creme"], ["Rapsöl", 10, "1 EL"], ["Gewürze, getrocknet", 3, "Majoran, Muskat, Salz"]
    ],
    schritte: [
      "Gemüse würfeln und im Öl anschwitzen.",
      "Brühe dazu, 20 Minuten weich kochen.",
      "Teilweise pürieren, Creme einrühren, mit Majoran und Muskat abschmecken."
    ]
  },
  "Kürbissuppe (mit Sahne)": {
    portionen: 2, zeit: "30 Min.",
    zutaten: [
      ["Kürbis", 600, "½ Hokkaido (mit Schale)"], ["Kartoffeln, gekocht", 150, "1 Kartoffel"], ["Zwiebeln", 60], ["Ingwer", 10],
      ["Gemüsebrühe", 500], ["Kokosmilch (Dose)", 100, "100 ml Kokosmilch oder Sahne"], ["Kürbiskerne", 20, "2 EL Kürbiskerne"]
    ],
    schritte: [
      "Kürbis, Kartoffel, Zwiebel und Ingwer würfeln.",
      "Mit der Brühe 20 Minuten weich kochen.",
      "Kokosmilch dazu, fein pürieren, mit gerösteten Kürbiskernen servieren."
    ]
  },
  "Ratatouille": {
    portionen: 2, zeit: "40 Min.",
    zutaten: [
      ["Aubergine", 200, "1 kleine Aubergine"], ["Zucchini", 200, "1 Zucchini"], ["Paprika", 200, "1 Paprika"], ["Tomaten", 200, "2 Tomaten"],
      ["Zwiebeln", 80], ["Knoblauch", 8, "2 Zehen"], ["Olivenöl", 20, "2 EL"], ["Kräuter, frisch", 10, "Thymian, Rosmarin"]
    ],
    schritte: [
      "Gemüse in Würfel schneiden.",
      "Zwiebel und Knoblauch im Öl anbraten, Aubergine dazu und 5 Minuten braten.",
      "Restliches Gemüse und Kräuter dazugeben, 20 Minuten schmoren."
    ],
    tipp: "Dazu Brot, Reis oder Couscous – oder Kichererbsen untermischen."
  },
  "Kartoffeln mit Kräuterquark": {
    portionen: 2, zeit: "25 Min.",
    zutaten: [
      ["Kartoffeln, gekocht", 600, "6 mittlere Kartoffeln"], ["Magerquark", 250, "1 Becher Quark"], ["Naturjoghurt 1,5 %", 100],
      ["Kräuter, frisch", 20, "Schnittlauch, Petersilie"], ["Rapsöl", 10, "1 EL Lein- oder Rapsöl"], ["Gurke", 150, "Gurke als Beilage"]
    ],
    schritte: [
      "Kartoffeln mit Schale 20 Minuten kochen.",
      "Quark, Joghurt, Öl und gehackte Kräuter verrühren, salzen.",
      "Mit den Kartoffeln und Gurkenscheiben servieren."
    ],
    tipp: "Viel Protein bei kleinem Fußabdruck. Vegan: Sojajoghurt statt Quark."
  },
  "Kartoffelpuffer": {
    portionen: 2, zeit: "35 Min.",
    zutaten: [
      ["Kartoffeln, gekocht", 600, "600 g rohe Kartoffeln"], ["Zwiebeln", 60, "1 kleine Zwiebel"], ["Ei, gekocht (1 Stück, ~60 g)", 60, "1 Ei"],
      ["Weizenmehl", 30, "2 EL Mehl"], ["Rapsöl", 30, "Öl zum Braten"], ["Apfelmus", 200]
    ],
    schritte: [
      "Kartoffeln und Zwiebel fein reiben und gut ausdrücken.",
      "Mit Ei, Mehl und Salz vermengen.",
      "Kleine Puffer im heißen Öl von beiden Seiten goldbraun braten, mit Apfelmus servieren."
    ]
  },
  "Sushi vegetarisch": {
    portionen: 2, zeit: "45 Min.",
    zutaten: [
      ["Reis (trocken)", 150, "Sushireis"], ["Noriblätter", 9, "3 Noriblätter"], ["Gurke", 100], ["Avocado", 100, "½ Avocado"],
      ["Karotten", 60, "1 kleine Karotte"], ["Essig", 20, "2 EL Reisessig"], ["Sojasauce", 20, "zum Dippen"]
    ],
    schritte: [
      "Reis kochen, mit Reisessig, etwas Zucker und Salz würzen und abkühlen lassen.",
      "Gemüse in dünne Stifte schneiden.",
      "Reis dünn auf die Noriblätter streichen, Gemüse darauf, fest aufrollen.",
      "Mit nassem Messer in Stücke schneiden, mit Sojasauce servieren."
    ]
  },
  "Wrap mit Gemüse und Hummus": {
    portionen: 2, zeit: "10 Min.",
    zutaten: [
      ["Tortilla-Wrap (Weizen)", 120, "2 Wraps"], ["Hummus", 100], ["Salat (Blattsalat)", 50],
      ["Karotten", 100, "1 Karotte, geraspelt"], ["Paprika", 100, "½ Paprika"], ["Gurke", 100]
    ],
    schritte: [
      "Wraps kurz in der Pfanne erwärmen.",
      "Mit Hummus bestreichen, Salat und Gemüsestreifen darauflegen.",
      "Fest einrollen und halbieren."
    ]
  },
  "Gemischter Salat mit Dressing": {
    portionen: 2, zeit: "10 Min.",
    zutaten: [
      ["Salat (Blattsalat)", 150], ["Tomaten", 150], ["Gurke", 150], ["Karotten", 80, "1 Karotte, geraspelt"],
      ["Rapsöl", 15, "1½ EL Öl"], ["Essig", 15, "1½ EL Essig"], ["Senf", 5, "1 TL Senf"]
    ],
    schritte: [
      "Salat waschen und zupfen, Gemüse schneiden.",
      "Öl, Essig, Senf, Salz und Pfeffer verrühren.",
      "Kurz vor dem Essen mischen."
    ],
    tipp: "Mit Kichererbsen, Linsen oder Kernen wird daraus eine ganze Mahlzeit."
  },
  "Couscous-Salat / Taboulé": {
    portionen: 2, zeit: "15 Min.",
    zutaten: [
      ["Couscous, gekocht", 300, "100 g Couscous, mit Wasser übergossen"], ["Kichererbsen, gekocht", 120, "½ Dose Kichererbsen"],
      ["Tomaten", 150], ["Gurke", 150], ["Kräuter, frisch", 30, "viel Petersilie und Minze"],
      ["Zitronensaft", 20, "Saft ½ Zitrone"], ["Olivenöl", 15, "1½ EL"]
    ],
    schritte: [
      "Couscous mit der gleichen Menge kochendem Salzwasser übergießen, 5 Minuten quellen lassen, auflockern.",
      "Tomaten, Gurke und Kräuter fein hacken.",
      "Alles mit Kichererbsen, Zitronensaft und Öl mischen, abschmecken."
    ]
  },
  "Linsensalat": {
    portionen: 2, zeit: "30 Min.",
    zutaten: [
      ["Linsen (trocken)", 120, "Berg- oder Belugalinsen"], ["Paprika", 100], ["Zwiebeln", 40, "½ rote Zwiebel"], ["Rucola", 40],
      ["Walnüsse", 20], ["Essig", 20, "2 EL Essig"], ["Olivenöl", 15, "1½ EL"], ["Senf", 5, "1 TL Senf"]
    ],
    schritte: [
      "Linsen 20–25 Minuten bissfest kochen, abgießen.",
      "Paprika und Zwiebel klein würfeln, Walnüsse grob hacken.",
      "Essig, Öl, Senf, Salz und Pfeffer verrühren, mit den noch warmen Linsen mischen.",
      "Gemüse, Rucola und Walnüsse unterheben."
    ],
    tipp: "Hält gekühlt 2–3 Tage – gut zum Vorkochen."
  },
  "Brot mit Hummus und Gemüse": {
    portionen: 2, zeit: "5 Min.",
    zutaten: [
      ["Vollkornbrot", 100, "2 Scheiben Vollkornbrot"], ["Hummus", 60], ["Gurke", 60], ["Tomaten", 60], ["Kräuter, frisch", 5, "Kresse oder Kräuter"]
    ],
    schritte: [
      "Brot mit Hummus bestreichen.",
      "Mit Gurken- und Tomatenscheiben belegen, Kräuter darüber."
    ]
  },
  "Müsli mit Haferdrink und Obst": {
    portionen: 2, zeit: "5 Min.",
    zutaten: [
      ["Haferflocken", 120], ["Hafermilch", 400, "400 ml Haferdrink"], ["Apfel", 180, "1 Apfel"],
      ["Beeren (gemischt)", 150, "Beeren (frisch oder TK)"], ["Walnüsse", 20]
    ],
    schritte: [
      "Haferflocken mit Haferdrink übergießen (über Nacht im Kühlschrank wird es cremig).",
      "Apfel reiben oder würfeln, mit Beeren und gehackten Walnüssen darübergeben."
    ],
    tipp: "Mit einem Löffel Sojajoghurt oder Erdnussmus kommt mehr Protein dazu."
  }
};

// Kurze Zubereitung für die Vorschläge unter „Tagesvorschlag ausgleichen“.
const BALANCE_HOWTO = {
  "Protein-Frühstück": "Haferflocken mit Haferdrink übergießen, Skyr unterrühren, Beeren und Chia-Samen darüber.",
  "Linsen-Kartoffel-Teller": "Kartoffeln und Linsen kochen, Gemüse dünsten, alles mit Olivenöl, Salz und etwas Essig anrichten.",
  "Tofu-Vollkorn-Abend": "Tofu würfeln und knusprig braten, Gemüse dünsten, mit Vollkornbrot und gehackten Walnüssen servieren.",
  "Hüttenkäse-Brot-Teller": "Brot mit Hüttenkäse bestreichen, Tomatenscheiben darauf, mit Olivenöl, Salz und Pfeffer.",
  "Ei-Kartoffel-Gemüse": "Kartoffeln kochen, Gemüse mit Olivenöl in der Pfanne braten, ein Spiegelei dazu.",
  "Quark-Bananen-Boost": "Quark glatt rühren, Banane in Scheiben und gehackte Mandeln darüber.",
  "Hafer-Frühstück pflanzlich": "Haferflocken mit Sojadrink übergießen, Banane und gehackte Walnüsse darauf.",
  "Kichererbsen-Quinoa-Schale": "Quinoa kochen, mit Kichererbsen und rohem Gemüse in eine Schale geben, Tahin mit Zitrone und Wasser als Sauce.",
  "Erdnuss-Brot mit Apfel": "Brot mit Erdnussbutter bestreichen, Apfelscheiben darauf oder dazu.",
  "Bohnen-Reis-Teller": "Reis kochen, Gemüse anbraten, Bohnen 3 Minuten mitwärmen, mit Kreuzkümmel und Salz würzen.",
  "Linsen-Pasta": "Rote Linsen in der Tomatensauce 15 Minuten köcheln, mit Vollkornnudeln mischen.",
  "Räuchertofu-Kartoffel-Pfanne": "Kartoffeln in Scheiben braten, Räuchertofu-Würfel und Brokkoli dazu, alles goldbraun braten."
};

// Schnelle Ideen für einzelne Lebensmittel, die „Neues entdecken“ vorschlägt.
const QUICK_IDEAS = {
  "Seitan": "In Streifen schneiden, scharf anbraten und mit Paprika, Zwiebeln und Sojasauce wie Geschnetzeltes servieren – dazu Reis.",
  "Tempeh": "In dünne Scheiben schneiden, in Sojasauce und etwas Ahornsirup marinieren und knusprig braten. Passt in Bowls und aufs Brot.",
  "Edamame": "Tiefgekühlt 4 Minuten in Salzwasser kochen, mit grobem Salz bestreuen und aus der Schote naschen – oder geschält in Salat und Bowl.",
  "Räuchertofu": "In Würfel schneiden und wie Speck in Bratkartoffeln, Nudeln oder Linsensuppe mitbraten.",
  "Tofu, natur": "Gut ausdrücken, würfeln, mit Speisestärke bestäuben und knusprig braten. Danach in Sojasauce schwenken – für Curry, Reis oder Salat.",
  "Weiße Bohnen, gekocht": "Mit Olivenöl, Knoblauch, Zitrone und Rosmarin zerdrücken – ein schneller Aufstrich fürs Brot, oder in Tomatensuppe geben.",
  "Schwarze Bohnen, gekocht": "Mit Mais, Paprika, Zwiebel und Limette als Salat, oder warm mit Kreuzkümmel in einen Wrap.",
  "Kidneybohnen (Dose)": "Abspülen und ins Chili, in Salat oder mit Reis und Gemüse in die Pfanne – siehe Chili sin Carne.",
  "Linsen rot, gekocht": "In 15 Minuten zu Dal oder Suppe kochen – sie zerfallen und machen alles cremig.",
  "Bohnen, gekocht": "Mit Tomaten, Zwiebeln und Kräutern zu einem warmen Bohnenragout, dazu Brot.",
  "Kichererbsen, gekocht": "Abtropfen, mit Öl und Paprikapulver im Ofen 25 Minuten rösten – knuspriger Snack oder Salat-Topping.",
  "Sojaschnetzel (trocken)": "10 Minuten in heißer Brühe einweichen, ausdrücken, kräftig anbraten und wie Geschnetzeltes in Rahm- oder Tomatensauce verwenden.",
  "Veganes Hack (Soja)": "Wie Hackfleisch verwenden – für Bolognese, Chili oder gefüllte Paprika.",
  "Hummus": "Als Brotaufstrich, Dip zu Gemüsesticks oder als Sauce im Wrap.",
  "Sojajoghurt natur": "Mit Haferflocken und Obst zum Frühstück, oder mit Kräutern und Knoblauch als Dip.",
  "Falafel": "Mit Salat, Gemüse und Tahin-Sauce ins Fladenbrot – siehe Falafel im Brot.",
  "Veggie-Burger-Patty": "Im Brötchen mit Salat, Tomate und Gurke, oder zerbröselt über einen Salat.",
  "Vegane Bratwurst": "Wie Bratwurst braten – mit Kartoffelsalat oder in Scheiben in einer Gemüsepfanne."
};
