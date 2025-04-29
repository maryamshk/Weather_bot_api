require('dotenv').config(); 

const express = require('express');
const bodyParser = require('body-parser');
const axios = require('axios');

const app = express();
const PORT = process.env.PORT || 3000;
const OPENWEATHERMAP_API_KEY = process.env.OPENWEATHERMAP_API_KEY;

app.use(bodyParser.json());

app.post('/webhook', async (req, res) => {
  try {
    const body = req.body;
    const city = body.queryResult.parameters['city'] || body.queryResult.parameters['geo-city'];
    const date = body.queryResult.parameters['date'] || body.queryResult.parameters['date-time'];

    if (!city) {
      return res.json({
        fulfillmentText: "I need to know which city you're asking about!"
      });
    }

    const coordinates = await getCoordinates(city);
    if (!coordinates) {
      return res.json({
        fulfillmentText: `Sorry, I couldn't find ${city}. Please check the spelling.`
      });
    }

    let responseText;
    const today = new Date().toISOString().split('T')[0];
    const requestedDate = date ? new Date(date).toISOString().split('T')[0] : today;

    if (!date || requestedDate === today) {

      // Current weather
      const weatherData = await getCurrentWeather(coordinates.lat, coordinates.lon);
      responseText = `Current weather in ${city}:
      - Temperature: ${weatherData.temp}°C
      - Feels like: ${weatherData.feels_like}°C
      - Conditions: ${weatherData.description}
      - Humidity: ${weatherData.humidity}%
      - Wind: ${weatherData.wind_speed} m/s`;
    } else {

      
      // Forecast
      const weatherData = await getForecastWeather(coordinates.lat, coordinates.lon, requestedDate);
      if (weatherData) {
        responseText = `Forecast for ${city} on ${requestedDate}:
        - Day Temperature: ${weatherData.tempDay}°C
        - Night Temperature: ${weatherData.tempNight}°C
        - Conditions: ${weatherData.description}
        - Humidity: ${weatherData.humidity}%`;
      } else {
        responseText = `No forecast available for ${requestedDate}. I can only provide forecasts up to 7 days ahead.`;
      }
    }

    return res.json({ fulfillmentText: responseText });

  } catch (error) {
    console.error('Error:', error.message);
    return res.json({
      fulfillmentText: "Sorry, I'm having trouble getting weather data. Please try again later."
    });
  }
});

async function getCoordinates(city) {
  const url = `https://api.openweathermap.org/geo/1.0/direct?q=${encodeURIComponent(city)}&limit=1&appid=${OPENWEATHERMAP_API_KEY}`;
  try {
    const response = await axios.get(url);
    return response.data?.[0] ? { lat: response.data[0].lat, lon: response.data[0].lon } : null;
  } catch (error) {
    console.error('Geocoding error:', error.message);
    return null;
  }
}

async function getCurrentWeather(lat, lon) {
  const url = `https://api.openweathermap.org/data/2.5/weather?lat=${lat}&lon=${lon}&appid=${OPENWEATHERMAP_API_KEY}&units=metric`;
  try {
    const response = await axios.get(url);
    return {
      temp: response.data.main.temp,
      feels_like: response.data.main.feels_like,
      description: response.data.weather[0].description,
      humidity: response.data.main.humidity,
      wind_speed: response.data.wind.speed
    };
  } catch (error) {
    console.error('Current weather error:', error.message);
    throw error;
  }
}

async function getForecastWeather(lat, lon, requestedDate) {
  const url = `https://api.openweathermap.org/data/2.5/forecast?lat=${lat}&lon=${lon}&appid=${OPENWEATHERMAP_API_KEY}&units=metric`;
  try {
    const response = await axios.get(url);
    const targetDate = new Date(requestedDate).toISOString().split('T')[0];
    
    // Find all forecasts for the requested date
    const dailyForecasts = response.data.list.filter(item => {
      return new Date(item.dt * 1000).toISOString().split('T')[0] === targetDate;
    });

    if (dailyForecasts.length === 0) return null;

    // Calculate day/night averages
    const dayTemps = dailyForecasts.map(f => f.main.temp);
    const nightTemps = dailyForecasts.filter(f => {
      const hours = new Date(f.dt * 1000).getHours();
      return hours < 6 || hours > 18; 
    }).map(f => f.main.temp);

    return {
      tempDay: (dayTemps.reduce((a, b) => a + b, 0) / dayTemps.length).toFixed(1),
      tempNight: nightTemps.length > 0 ? 
        (nightTemps.reduce((a, b) => a + b, 0) / nightTemps.length).toFixed(1) : 'N/A',
      description: mostFrequent(dailyForecasts.map(f => f.weather[0].description)),
      humidity: (dailyForecasts.reduce((sum, f) => sum + f.main.humidity, 0) / dailyForecasts.length).toFixed(1)
    };
  } catch (error) {
    console.error('Forecast error:', error.message);
    throw error;
  }
}

function mostFrequent(arr) {
  const counts = {};
  arr.forEach(item => { counts[item] = (counts[item] || 0) + 1; });
  return Object.keys(counts).reduce((a, b) => counts[a] > counts[b] ? a : b);
}

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});