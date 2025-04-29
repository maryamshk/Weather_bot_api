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
  const url = `https://api.openweathermap.org/data/3.0/onecall?lat=${lat}&lon=${lon}&exclude=current,minutely,hourly,alerts&appid=${OPENWEATHERMAP_API_KEY}&units=metric`;
  
  try {
    const response = await axios.get(url);
    const targetDate = new Date(requestedDate).toISOString().split('T')[0];

    const dailyForecast = response.data.daily.find(day => {
      const forecastDate = new Date(day.dt * 1000).toISOString().split('T')[0];
      return forecastDate === targetDate;
    });

    if (!dailyForecast) return null;

    return {
      tempDay: dailyForecast.temp.day.toFixed(1),
      tempNight: dailyForecast.temp.night.toFixed(1),
      description: dailyForecast.weather[0].description,
      humidity: dailyForecast.humidity
    };
  } catch (error) {
    console.error('One Call 3.0 Forecast error:', error.message);
    throw error;
  }
}

app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});