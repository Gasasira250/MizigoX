import { useEffect, useState, type FormEvent } from 'react'
import { useSearchParams } from 'react-router-dom'
import {
  createDriver,
  createTrailer,
  createTruck,
  listDrivers,
  listTrailers,
  listTrucks,
  updateDriver,
  updateTrailer,
  updateTruck,
} from '../api'
import StatusBadge from '../components/StatusBadge'
import { VEHICLE_LABEL, VEHICLE_TYPES } from '../format'
import type { Driver, Trailer, Truck } from '../types'

type Tab = 'trucks' | 'trailers' | 'drivers'

export default function FleetPage() {
  const [params, setParams] = useSearchParams()
  const tab = (['trucks', 'trailers', 'drivers'].includes(params.get('tab') || '') ? params.get('tab') : 'trucks') as Tab
  const [drivers, setDrivers] = useState<Driver[]>([])
  const [trucks, setTrucks] = useState<Truck[]>([])
  const [trailers, setTrailers] = useState<Trailer[]>([])
  const [error, setError] = useState('')
  const [truckForm, setTruckForm] = useState({
    unit_number: '',
    vin: '',
    plate: '',
    vehicle_type: 'double_diff',
    capacity_tonnes: '28',
    spec: '',
  })
  const [trailerForm, setTrailerForm] = useState({ unit_number: '', plate: '' })
  const [driverForm, setDriverForm] = useState({ name: '', phone: '', cdl: '', vehicle_type: 'double_diff' })

  async function refresh() {
    const [d, t, tr] = await Promise.all([listDrivers(), listTrucks(), listTrailers()])
    setDrivers(d)
    setTrucks(t)
    setTrailers(tr)
  }

  useEffect(() => {
    refresh().catch((err: Error) => setError(err.message))
  }, [])

  async function addTruck(e: FormEvent) {
    e.preventDefault()
    try {
      await createTruck({
        unit_number: truckForm.unit_number,
        vin: truckForm.vin,
        plate: truckForm.plate,
        vehicle_type: truckForm.vehicle_type,
        capacity_tonnes: Number(truckForm.capacity_tonnes || 28),
        spec: truckForm.spec,
        status: 'available',
      })
      setTruckForm({
        unit_number: '',
        vin: '',
        plate: '',
        vehicle_type: 'double_diff',
        capacity_tonnes: '28',
        spec: '',
      })
      await refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not add truck')
    }
  }

  async function addTrailer(e: FormEvent) {
    e.preventDefault()
    try {
      await createTrailer({ ...trailerForm, status: 'available' })
      setTrailerForm({ unit_number: '', plate: '' })
      await refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not add trailer')
    }
  }

  async function addDriver(e: FormEvent) {
    e.preventDefault()
    try {
      await createDriver({ ...driverForm, status: 'available' })
      setDriverForm({ name: '', phone: '', cdl: '', vehicle_type: 'double_diff' })
      await refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not add driver')
    }
  }

  return (
    <div>
      <header className="page-head">
        <div>
          <p className="page-kicker">Network</p>
          <h1>{tab === 'drivers' ? 'Drivers' : tab === 'trailers' ? 'Trailers' : 'Vehicles'}</h1>
          <p className="muted">Trucks, trailers, and drivers on the book.</p>
        </div>
      </header>
      <div className="tabs">
        {(['trucks', 'trailers', 'drivers'] as Tab[]).map((item) => (
          <button
            key={item}
            type="button"
            className={tab === item ? 'active' : ''}
            onClick={() => setParams({ tab: item })}
          >
            {item === 'trucks' ? 'Trucks' : item === 'trailers' ? 'Trailers' : 'Drivers'}
          </button>
        ))}
      </div>
      {error ? <p className="error">{error}</p> : null}

      {tab === 'trucks' ? (
        <>
          <form className="panel form-inline" onSubmit={addTruck}>
            <input
              required
              placeholder="Unit #"
              value={truckForm.unit_number}
              onChange={(e) => setTruckForm({ ...truckForm, unit_number: e.target.value })}
            />
            <input
              placeholder="VIN"
              value={truckForm.vin}
              onChange={(e) => setTruckForm({ ...truckForm, vin: e.target.value })}
            />
            <select
              value={truckForm.vehicle_type}
              onChange={(e) => setTruckForm({ ...truckForm, vehicle_type: e.target.value })}
            >
              {VEHICLE_TYPES.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.label}
                </option>
              ))}
            </select>
            <input
              type="number"
              min="1"
              placeholder="Capacity (t)"
              value={truckForm.capacity_tonnes}
              onChange={(e) => setTruckForm({ ...truckForm, capacity_tonnes: e.target.value })}
            />
            <input
              placeholder="Spec (e.g. double difference 10-wheeler)"
              value={truckForm.spec}
              onChange={(e) => setTruckForm({ ...truckForm, spec: e.target.value })}
            />
            <input
              placeholder="Plate"
              value={truckForm.plate}
              onChange={(e) => setTruckForm({ ...truckForm, plate: e.target.value })}
            />
            <button type="submit">Add truck</button>
          </form>
          <div className="table-wrap panel">
            <table className="ops-table">
              <thead>
                <tr>
                  <th>Unit</th>
                  <th>Plate</th>
                  <th>Type</th>
                  <th>Capacity</th>
                  <th>Spec</th>
                  <th>Status</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {trucks.map((truck) => (
                  <tr key={truck.id}>
                    <td>{truck.unit_number}</td>
                    <td>{truck.plate}</td>
                    <td>{VEHICLE_LABEL[truck.vehicle_type || ''] ?? truck.vehicle_type}</td>
                    <td>{truck.capacity_tonnes ?? 28} t</td>
                    <td>{truck.spec || '—'}</td>
                    <td>
                      <StatusBadge status={truck.status} />
                    </td>
                    <td>
                      {truck.status !== 'on_load' ? (
                        <button
                          type="button"
                          className="ghost"
                          onClick={() =>
                            updateTruck(truck.id, {
                              status: truck.status === 'maintenance' ? 'available' : 'maintenance',
                            }).then(refresh)
                          }
                        >
                          {truck.status === 'maintenance' ? 'Mark available' : 'Maintenance'}
                        </button>
                      ) : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      ) : null}

      {tab === 'trailers' ? (
        <>
          <form className="panel form-inline" onSubmit={addTrailer}>
            <input
              required
              placeholder="Unit #"
              value={trailerForm.unit_number}
              onChange={(e) => setTrailerForm({ ...trailerForm, unit_number: e.target.value })}
            />
            <input
              placeholder="Plate"
              value={trailerForm.plate}
              onChange={(e) => setTrailerForm({ ...trailerForm, plate: e.target.value })}
            />
            <button type="submit">Add trailer</button>
          </form>
          <div className="table-wrap panel">
            <table className="ops-table">
              <thead>
                <tr>
                  <th>Unit</th>
                  <th>Plate</th>
                  <th>Status</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {trailers.map((trailer) => (
                  <tr key={trailer.id}>
                    <td>{trailer.unit_number}</td>
                    <td>{trailer.plate}</td>
                    <td>
                      <StatusBadge status={trailer.status} />
                    </td>
                    <td>
                      {trailer.status !== 'on_load' ? (
                        <button
                          type="button"
                          className="ghost"
                          onClick={() =>
                            updateTrailer(trailer.id, {
                              status: trailer.status === 'maintenance' ? 'available' : 'maintenance',
                            }).then(refresh)
                          }
                        >
                          {trailer.status === 'maintenance' ? 'Mark available' : 'Maintenance'}
                        </button>
                      ) : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      ) : null}

      {tab === 'drivers' ? (
        <>
          <form className="panel form-inline" onSubmit={addDriver}>
            <input
              required
              placeholder="Name"
              value={driverForm.name}
              onChange={(e) => setDriverForm({ ...driverForm, name: e.target.value })}
            />
            <input
              placeholder="Phone"
              value={driverForm.phone}
              onChange={(e) => setDriverForm({ ...driverForm, phone: e.target.value })}
            />
            <input
              placeholder="CDL"
              value={driverForm.cdl}
              onChange={(e) => setDriverForm({ ...driverForm, cdl: e.target.value })}
            />
            <select
              value={driverForm.vehicle_type}
              onChange={(e) => setDriverForm({ ...driverForm, vehicle_type: e.target.value })}
            >
              {VEHICLE_TYPES.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.label}
                </option>
              ))}
            </select>
            <button type="submit">Add driver</button>
          </form>
          <div className="table-wrap panel">
            <table className="ops-table">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Phone</th>
                  <th>Vehicle</th>
                  <th>CDL</th>
                  <th>Status</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {drivers.map((driver) => (
                  <tr key={driver.id}>
                    <td>{driver.name}</td>
                    <td>{driver.phone}</td>
                    <td>{VEHICLE_LABEL[driver.vehicle_type || ''] ?? driver.vehicle_type}</td>
                    <td>{driver.cdl}</td>
                    <td>
                      <StatusBadge status={driver.status} />
                    </td>
                    <td>
                      {driver.status !== 'on_load' ? (
                        <button
                          type="button"
                          className="ghost"
                          onClick={() =>
                            updateDriver(driver.id, {
                              status: driver.status === 'off_duty' ? 'available' : 'off_duty',
                            }).then(refresh)
                          }
                        >
                          {driver.status === 'off_duty' ? 'Mark available' : 'Off duty'}
                        </button>
                      ) : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      ) : null}
    </div>
  )
}
