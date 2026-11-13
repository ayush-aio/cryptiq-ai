import os
import json
import requests

from dotenv import load_dotenv
from newsapi import NewsApiClient

from langchain_openai import ChatOpenAI
from langchain_core.tools import tool
from langchain_core.messages import SystemMessage, HumanMessage

from langgraph.prebuilt import ToolNode, tools_condition
from langgraph.graph import StateGraph, MessagesState, START
from langgraph.checkpoint.memory import MemorySaver


# =====================================================
# 1. LOAD ENVIRONMENT VARIABLES
# =====================================================

load_dotenv()

OPENAI_API_KEY = os.getenv("OPENAI_API_KEY")
FREECRYPTO_TOKEN = os.getenv("FREECRYPTO_TOKEN")
NEWSAPI_KEY = os.getenv("NEWSAPI_KEY")

if not all([OPENAI_API_KEY, FREECRYPTO_TOKEN, NEWSAPI_KEY]):
    raise ValueError("Missing API keys in .env file")


# =====================================================
# 2. INITIALIZE LLM
# =====================================================

llm = ChatOpenAI(
    model="gpt-4o-mini",
    temperature=0
)


# =====================================================
# 3. TOOL OUTPUT SAFETY
# =====================================================

MAX_CHARS = 8000


def safe_output(obj) -> str:
    text = json.dumps(obj, ensure_ascii=False)

    if len(text) > MAX_CHARS:
        return json.dumps({
            "status": False,
            "error": "API response exceeded output limit"
        })

    return text


# =====================================================
# 4. CRYPTO LIST TOOL
# =====================================================

@tool
def crypto_list_tool(limit: int = 25) -> str:
    """
    Retrieves available cryptocurrencies from FreeCryptoAPI.

    Args:
        limit: Maximum number of cryptocurrencies to return.

    Returns:
        JSON string containing cryptocurrency symbols and names.
    """

    url = "https://api.freecryptoapi.com/v1/getCryptoList"

    headers = {
        "Authorization": f"Bearer {FREECRYPTO_TOKEN}"
    }

    try:
        resp = requests.get(url, headers=headers, timeout=30)
        resp.raise_for_status()
        data = resp.json()

    except requests.RequestException as e:
        return json.dumps({"status": False, "error": str(e)})

    except ValueError:
        return json.dumps({
            "status": False,
            "error": "Invalid JSON from API"
        })

    coins = None

    if isinstance(data, list):
        coins = data

    elif isinstance(data, dict):
        for key in ("result", "results", "data", "coins", "symbols"):
            if isinstance(data.get(key), list):
                coins = data[key]
                break

    if coins is None:
        return json.dumps({
            "status": False,
            "error": "Unexpected API format",
            "preview": str(data)[:500]
        })

    limit = max(1, min(limit, 100))

    slim = []

    for item in coins[:limit]:

        if isinstance(item, dict):

            sym = (
                item.get("symbol")
                or item.get("Symbol")
                or item.get("ticker")
            )

            name = item.get("name") or item.get("Name")

        else:
            sym, name = str(item), None

        if sym or name:
            slim.append({
                "symbol": sym,
                "name": name
            })

    return safe_output({
        "status": True,
        "coins": slim
    })


# =====================================================
# 5. CRYPTO DATA TOOL
# =====================================================

@tool
def crypto_data_tool(symbol: str) -> str:
    """
    Retrieves detailed market information for a cryptocurrency.

    Args:
        symbol: Cryptocurrency symbol, such as BTC or ETH.

    Returns:
        JSON string containing cryptocurrency market information.
    """

    url = "https://api.freecryptoapi.com/v1/getData"

    headers = {
        "Authorization": f"Bearer {FREECRYPTO_TOKEN}"
    }

    params = {
        "symbol": symbol.upper().strip()
    }

    try:
        resp = requests.get(
            url,
            headers=headers,
            params=params,
            timeout=30
        )

        resp.raise_for_status()

        return safe_output(resp.json())

    except requests.RequestException as e:
        return json.dumps({
            "status": False,
            "error": str(e)
        })

    except ValueError:
        return json.dumps({
            "status": False,
            "error": "Invalid JSON from API"
        })


# =====================================================
# 6. CRYPTO NEWS TOOL
# =====================================================

@tool
def crypto_news_tool(query: str, max_items: int = 3) -> str:
    """
    Retrieves recent cryptocurrency-related news.

    Args:
        query: Search topic, such as bitcoin or ethereum.
        max_items: Maximum number of articles to return.

    Returns:
        JSON string containing news articles.
    """

    try:
        max_items = max(1, min(max_items, 10))

        newsapi = NewsApiClient(api_key=NEWSAPI_KEY)

        res = newsapi.get_everything(
            q=query,
            language="en",
            sort_by="publishedAt",
            page=1,
            page_size=max_items
        )

        articles = []

        for item in res.get("articles", [])[:max_items]:

            articles.append({
                "title": item.get("title"),
                "source": (item.get("source") or {}).get("name"),
                "url": item.get("url"),
                "publishedAt": item.get("publishedAt"),
                "description": item.get("description")
            })

        return safe_output({
            "status": True,
            "totalResults": res.get("totalResults", 0),
            "returned": len(articles),
            "articles": articles
        })

    except Exception as e:
        return json.dumps({
            "status": False,
            "error": str(e)
        })


# =====================================================
# 7. REGISTER TOOLS
# =====================================================

tools = [
    crypto_data_tool,
    crypto_list_tool,
    crypto_news_tool
]

tool_node = ToolNode(tools=tools)

llm_with_tools = llm.bind_tools(tools)


# =====================================================
# 8. SYSTEM PROMPT
# =====================================================

SYSTEM_PROMPT = """
You are an expert Crypto Market Analyst AI.

Your responsibility is to help users understand cryptocurrency
markets using reliable, up-to-date information.

RULES:

1. Always use the available tools to retrieve factual market data.
2. Never invent cryptocurrency prices, market capitalization,
   supply information, or news.
3. Use crypto_list_tool to identify available cryptocurrencies.
4. Use crypto_data_tool to retrieve information about specific coins.
5. Use crypto_news_tool to retrieve relevant cryptocurrency news.
6. If a tool returns an error, clearly inform the user.
7. Distinguish verified facts from your own interpretation.
8. Never guarantee future cryptocurrency prices or investment returns.

RESPONSE FORMAT:

Summary:
Briefly summarize the findings.

Data:
Present relevant cryptocurrency information.
Mention the actual field names returned by the API,
such as priceUsd, if available.

What it means:
Explain the market information in simple language.

Next steps:
Suggest what information the user could investigate further.

Always be transparent about missing or unavailable information.
"""

sys_msg = SystemMessage(content=SYSTEM_PROMPT)


# =====================================================
# 9. ASSISTANT NODE
# =====================================================

def assistant(state: MessagesState):

    return {
        "messages": [
            llm_with_tools.invoke(
                [sys_msg] + state["messages"]
            )
        ]
    }


# =====================================================
# 10. BUILD LANGGRAPH
# =====================================================

builder = StateGraph(MessagesState)

# Add nodes
builder.add_node("assistant", assistant)
builder.add_node("tools", tool_node)

# Add edges
builder.add_edge(START, "assistant")

builder.add_conditional_edges(
    "assistant",
    tools_condition
)

builder.add_edge("tools", "assistant")


# =====================================================
# 11. COMPILE GRAPHS
# =====================================================

# Stateless graph
react_graph = builder.compile()

# Graph with memory
memory = MemorySaver()

react_graph_memory = builder.compile(
    checkpointer=memory
)


# =====================================================
# 12. RENDER GRAPH
# =====================================================

print("\n--- LANGGRAPH WORKFLOW ---")

print(
    react_graph.get_graph(xray=True).draw_mermaid()
)

try:
    png = react_graph.get_graph(
        xray=True
    ).draw_mermaid_png()

    with open("graph.png", "wb") as f:
        f.write(png)

    print("\nGraph saved as graph.png")

except Exception as e:
    print("\nCould not render PNG:", e)


# =====================================================
# 13. RUN AND TEST AGENT
# =====================================================

if __name__ == "__main__":

    # 1. Session banner
    print("\n" + "=" * 55)
    print("       CRYPTO ANALYSIS AGENT")
    print("=" * 55)
    print("Ask me anything about cryptocurrencies!")
    print("Type 'exit' or 'quit' to end the conversation.")
    print("Press Ctrl+C or Ctrl+D to exit.")
    print("=" * 55)

    # 2. Initialize conversation thread
    config = {
        "configurable": {
            "thread_id": "crypto-thread-1"
        }
    }

    # 3. Interactive chat loop
    while True:
        try:
            user_input = input("\nYou: ").strip()

            # Skip empty messages
            if not user_input:
                continue

            # Exit commands
            if user_input.lower() in {"exit", "quit"}:
                print("👋 Bye!")
                break

            # 4. Convert input into HumanMessage
            messages = [HumanMessage(content=user_input)]

            # 5. Invoke graph using conversation memory
            result = react_graph_memory.invoke(
                {"messages": messages},
                config
            )

            # 6. Extract only the final AI response
            last_ai = next(
                (m for m in reversed(result["messages"]) if m.type == "ai"),
                None
            )

            if last_ai:
                print(f"\n🤖 Agent: {last_ai.content}\n")
            else:
                print("\n🤖 Agent: [No reply]\n")

        except KeyboardInterrupt:
            print("\n👋 Bye!")
            break

        except EOFError:
            print("\n👋 Bye!")
            break

        except Exception as e:
            print(f"\n⚠️ Something went wrong: {e}")



