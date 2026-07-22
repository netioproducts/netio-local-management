import './assets/styles/App.css';
import './assets/styles/styleguide.css';
import { BrowserRouter, Route, Routes } from 'react-router';
import Layout from './layouts/Layout';
import { ConfigView } from './pages/ConfigView';
import { DeviceList } from './pages/DeviceList/DeviceList';
import { UserList } from './pages/UserList';
import { GroupList } from './pages/GroupList';
import { DeviceView } from './pages/DeviceView/DeviceView';
import { DevicesList } from './pages/DevicesView';

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Layout />} >
          <Route index element={<DeviceList />} />
          <Route path="config" element={<ConfigView />} />
          <Route path="users" element={<UserList />} />
          <Route path="groups" element={<GroupList />} />
          <Route path="devices" element={<DevicesList />} />
          <Route path="device/:deviceId" element={<DeviceView />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}

export default App;
