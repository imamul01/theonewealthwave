// DOM Loaded Event
document.addEventListener('DOMContentLoaded', function() {
    console.log("Website loaded successfully!");

    // 1. Typing Animation
    const typed = new Typed('.typing-text', {
        strings: ['TheOneWealthWave', 'Smart Investments', 'Your Financial Freedom'],
        typeSpeed: 50,
        backSpeed: 30,
        loop: true,
        showCursor: true,
        cursorChar: '|'
    });

    // 2. Particles.js Initialization
    particlesJS('particles-js', {
        particles: {
            number: { value: 80, density: { enable: true, value_area: 800 } },
            color: { value: "#00d2ff" },
            shape: { type: "circle" },
            opacity: { value: 0.5, random: true },
            size: { value: 3, random: true },
            line_linked: { enable: true, distance: 150, color: "#00d2ff", opacity: 0.4, width: 1 },
            move: { enable: true, speed: 2, direction: "none", random: true, straight: false, out_mode: "out" }
        },
        interactivity: {
            detect_on: "canvas",
            events: {
                onhover: { enable: true, mode: "repulse" },
                onclick: { enable: true, mode: "push" }
            }
        }
    });

    // 3. Initialize Charts
    const cryptoChart = initChart('crypto-chart', 'Cryptocurrency Prices');
    const forexChart = initChart('forex-chart', 'Forex Rates');
    const stocksChart = initChart('stocks-chart', 'Stock Prices');

    // 4. Fetch Initial Data
    fetchMarketData();

    // 5. Auto-refresh every 30 seconds
    setInterval(fetchMarketData, 30000);

    // 6. Refresh Button Events
    document.querySelectorAll('.refresh-btn').forEach(btn => {
        btn.addEventListener('click', fetchMarketData);
    });
});

// Initialize Chart.js
function initChart(chartId, label) {
    const ctx = document.getElementById(chartId).getContext('2d');
    return new Chart(ctx, {
        type: 'line',
        data: {
            labels: [],
            datasets: [{
                label: label,
                data: [],
                borderColor: '#00d2ff',
                borderWidth: 2,
                fill: false,
                tension: 0.4
            }]
        },
        options: {
            responsive: true,
            plugins: {
                legend: {
                    display: false
                }
            },
            scales: {
                y: {
                    beginAtZero: false,
                    grid: {
                        color: 'rgba(255, 255, 255, 0.1)'
                    }
                },
                x: {
                    grid: {
                        color: 'rgba(255, 255, 255, 0.1)'
                    }
                }
            }
        }
    });
}

// Fetch All Market Data
async function fetchMarketData() {
    try {
        console.log("Fetching latest market data...");
        
        // 1. Fetch Crypto Data
        const cryptoResponse = await fetch('https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&order=market_cap_desc&per_page=5&page=1');
        const cryptoData = await cryptoResponse.json();
        updateMarketTicker('crypto-data', cryptoData, 'coin');
        updateChartData('crypto-chart', cryptoData.map(coin => coin.current_price));

        // 2. Fetch Forex Data (Mock)
        const forexPairs = [
            { pair: 'USD/EUR', rate: 0.85 + (Math.random() * 0.1 - 0.05), change: (Math.random() * 0.5 - 0.25) },
            { pair: 'USD/GBP', rate: 0.73 + (Math.random() * 0.1 - 0.05), change: (Math.random() * 0.5 - 0.25) },
            { pair: 'USD/JPY', rate: 110.25 + (Math.random() * 5 - 2.5), change: (Math.random() * 0.5 - 0.25) }
        ];
        updateMarketTicker('forex-data', forexPairs, 'pair');
        updateChartData('forex-chart', forexPairs.map(pair => pair.rate));

        // 3. Fetch Indian Stocks (Mock)
        const indianStocks = [
            { symbol: 'RELIANCE', price: 2456.75 + (Math.random() * 50 - 25), change: (Math.random() * 2 - 1) },
            { symbol: 'TCS', price: 3421.50 + (Math.random() * 50 - 25), change: (Math.random() * 2 - 1) },
            { symbol: 'HDFCBANK', price: 1567.25 + (Math.random() * 30 - 15), change: (Math.random() * 2 - 1) }
        ];
        updateMarketTicker('stocks-data', indianStocks, 'stock');
        updateChartData('stocks-chart', indianStocks.map(stock => stock.price));

    } catch (error) {
        console.error("Error fetching data:", error);
    }
}

// Update Market Ticker
function updateMarketTicker(elementId, data, type) {
    const container = document.getElementById(elementId);
    if (!container) return;

    container.innerHTML = data.map(item => {
        const change = type === 'coin' ? item.price_change_percentage_24h : item.change;
        const changeClass = change > 0 ? 'price-up' : change < 0 ? 'price-down' : 'price-neutral';
        
        return `
            <div class="${type} ${changeClass} animate__animated animate__fadeIn">
                <div class="${type}-name">
                    ${type === 'coin' ? `<img src="${item.image}" width="20">` : 
                     type === 'pair' ? `<i class="fas fa-globe"></i>` : 
                     `<i class="fas fa-rupee-sign"></i>`}
                    <span>${type === 'coin' ? item.symbol.toUpperCase() : 
                          type === 'pair' ? item.pair : item.symbol}</span>
                </div>
                <div class="${type}-price">
                    ${type === 'coin' ? '$' + item.current_price.toFixed(2) : 
                     type === 'pair' ? item.rate.toFixed(4) : 
                     '₹' + item.price.toFixed(2)}
                    <span class="price-change">
                        ${change > 0 ? '+' : ''}${change.toFixed(2)}%
                    </span>
                </div>
            </div>
        `;
    }).join('');
}

// Update Chart Data
function updateChartData(chartId, prices) {
    const chart = Chart.getChart(chartId);
    if (!chart) return;

    chart.data.labels = prices.map((_, i) => `Day ${i + 1}`);
    chart.data.datasets[0].data = prices;
    chart.update();
}

// Smooth Scroll for Navigation
document.querySelectorAll('a[href^="#"]').forEach(anchor => {
    anchor.addEventListener('click', function(e) {
        e.preventDefault();
        document.querySelector(this.getAttribute('href')).scrollIntoView({
            behavior: 'smooth'
        });
    });
});