import { Container, Nav, Navbar, Form } from 'react-bootstrap';
import { Link, useLocation } from 'react-router';
import netioLogo from '../assets/images/netio-logo.png';
import { useCompactMode } from '../context/CompactModeContext';

export const NetioNavbar = () => {
  const location = useLocation();
  const { compactMode, setCompactMode } = useCompactMode();
  return (
    <>
      <Navbar fixed="top" expand="sm" className="navbar-dark" style={{ backgroundColor: 'var(--netio-green)' }}>
        <Container>
          <Navbar.Brand className="fs-3" href="/"><img src={netioLogo} alt="Netio" /></Navbar.Brand>
          <Navbar.Toggle aria-controls="basic-navbar-nav" />
          <Navbar.Collapse id="basic-navbar-nav">
            <Nav className="me-auto">
              {/* <Nav.Link as={Link} to="/">Sockets</Nav.Link> */}
              <Nav.Link as={Link} to="/">Overview</Nav.Link>
              <Nav.Link as={Link} to="/users">Users</Nav.Link>
              <Nav.Link as={Link} to="/groups">Groups</Nav.Link>
              <Nav.Link as={Link} to="/devices">Devices</Nav.Link>
            </Nav>
            {location.pathname === '/' && (
              <div className="ms-2" style={{ transform: 'scale(0.8)', transformOrigin: 'right center', opacity: 0.75 }}>
                <Form.Check
                  type="switch"
                  id="sneaky-switch"
                  label="Compact mode"
                  className="text-white m-0 sneaky-switch"
                  checked={compactMode}
                  onChange={(e) => {
                    setCompactMode(e.target.checked);
                  }}
                />
              </div>
            )}
          </Navbar.Collapse>
        </Container>
      </Navbar>
      <div style={{ height: '4em' }} />
    </>
  );
}
