import { useOpfs } from "./lib/opfs";

export function App() {
  const { tree, addDir, remove } = useOpfs();

  return (
    <>
      <button
        onClick={() => {
          addDir("test");
        }}
      >
        addDir
      </button>
      <button
        onClick={() => {
          remove();
        }}
      >
        remove
      </button>
      <nav>
        {tree.name}
        <ul>
          {tree.children.map((child) => (
            <li key={child.name}>
              {child.kind === "dir" ? (
                <div>
                  <button
                    onClick={async () => {
                      await addDir(`${new Date()}`);
                    }}
                  >
                    {child.name}
                  </button>
                  <ul>
                    {child.children.map((child) => (
                      <li key={child.name}>{child.name}</li>
                    ))}
                  </ul>
                </div>
              ) : (
                <p>{child.name}</p>
              )}
            </li>
          ))}
        </ul>
      </nav>
    </>
  );
}
