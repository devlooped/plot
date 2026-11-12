import {plotRenderer} from "@devlooped/plotdown/streamdown";
import {useRef, useState} from "react";
import {Streamdown} from "streamdown";
import {answer, question} from "./answer.js";

const plugins = {renderers: [plotRenderer]};

/** Streams the canned answer a few characters at a time, as a model would. */
function stream(onText, onDone, {chunk = 6, delay = 30} = {}) {
  let length = 0;
  const timer = setInterval(() => {
    length = Math.min(answer.length, length + chunk);
    onText(answer.slice(0, length));
    if (length === answer.length) {
      clearInterval(timer);
      onDone();
    }
  }, delay);
  return () => clearInterval(timer);
}

export function App() {
  const [messages, setMessages] = useState([]);
  const [streaming, setStreaming] = useState(false);
  const stop = useRef(null);

  const ask = () => {
    stop.current?.();
    setMessages([{role: "user", text: question}, {role: "assistant", text: ""}]);
    setStreaming(true);
    stop.current = stream(
      (text) => setMessages((list) => [list[0], {role: "assistant", text}]),
      () => setStreaming(false)
    );
  };

  return (
    <main>
      <h1>plotdown + Streamdown</h1>
      <div className="messages">
        {messages.map((message, index) =>
          message.role === "user" ? (
            <p key={index} className="user">{message.text}</p>
          ) : (
            <div key={index} className="assistant" data-streaming={streaming || undefined}>
              <Streamdown plugins={plugins} isAnimating={streaming}>{message.text}</Streamdown>
            </div>
          )
        )}
      </div>
      <button type="button" onClick={ask} disabled={streaming}>
        {messages.length ? "Ask again" : "Ask: " + question}
      </button>
    </main>
  );
}
