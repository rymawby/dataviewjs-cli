(async () => {
  const currentFile = dv.current().file;
  let meetingNotes = dv.pages("#meeting").where((page) =>
    page.file.name.includes(`${currentFile.day.toFormat("yyyy-MM-dd")}`)
  );

  const data = [];
  for (let note of meetingNotes.sort((note) => note.file.day, "desc")) {
    data.push({ name: note.file.name });
  }

  dv.table(["Meeting Name"], data.map((entry) => [`- [[${entry.name}]]`]));
})();
